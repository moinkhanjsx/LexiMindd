# app.py
from flask import Flask, render_template, request, jsonify, make_response
import io
import os
import gc
import gdown
import joblib
import pdfplumber
import numpy as np
from sentence_transformers import util
import PyPDF2
from werkzeug.exceptions import RequestEntityTooLarge
import google.generativeai as genai
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# -------- CONFIG ----------
app = Flask(__name__)
# set max upload size (bytes) — here 10 MB (adjust as needed)
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024

# -------- Helpers ----------
def download_and_load(file_id, local_path):
    """Download from Google Drive (if not exists) and load pickle file."""
    url = f"https://drive.google.com/uc?id={file_id}"
    if not os.path.exists(local_path):
        gdown.download(url, local_path, quiet=False)
    return joblib.load(local_path)

def read_pdf_from_bytes(file_bytes):
    """
    Extract text from PDF bytes without saving to disk.
    Tries pdfplumber first, falls back to PyPDF2 if needed.
    """
    text_pages = []
    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            for page in pdf.pages:
                txt = page.extract_text()
                if txt:
                    text_pages.append(txt)
        if text_pages:
            return "\n".join(text_pages)
    except Exception:
        pass

    # fallback to PyPDF2
    try:
        reader = PyPDF2.PdfReader(io.BytesIO(file_bytes))
        for page in reader.pages:
            txt = page.extract_text()
            if txt:
                text_pages.append(txt)
        return "\n".join(text_pages)
    except Exception as e:
        return f"[ERROR] Could not extract PDF text: {e}"

# -------- Load models / data once ----------
judgment_texts = download_and_load("1vAA2spJ-AzHhBqs-gl6gL5_wDk22a5VW", "judgment_texts.pkl")
model = download_and_load("1-pje6HUuprf19yGIbJQA7MNwPNGqTkF0", "model.pkl")
case_names = download_and_load("1_IZQmTuucallXvQaeLM8P9q0co79_JD6", "case_names.pkl")
embeddings = download_and_load("1molCaZLasdsSMqqskRIcHnmnpQWfAupF", "embeddings.pkl")
modellog = download_and_load("1XALJYnXhZB9gXdjAgz8y_I852CpYt-eg", "modellog.pkl")

# -------- Initialize Gemini AI ----------
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
if GEMINI_API_KEY:
    try:
        genai.configure(api_key=GEMINI_API_KEY)
        print(f"[INFO] Attempting to initialize Gemini AI with API key: {GEMINI_API_KEY[:10]}...")

        # Try different model names in order of preference (updated for current API)
        model_names = ['gemini-1.5-flash', 'gemini-1.5-pro']
        gemini_model = None

        try:
            # Try to create the model without testing it (to avoid quota usage during startup)
            gemini_model = genai.GenerativeModel(model_names[0])
            print(f"[INFO] Gemini AI model created successfully (without testing)")
        except Exception as e:
            print(f"[WARNING] Failed to initialize Gemini model: {str(e)}")
            print("[WARNING] AI features will be disabled due to quota/API issues")
            gemini_model = None
    except Exception as e:
        print(f"[ERROR] Failed to configure Gemini AI: {str(e)}")
        gemini_model = None
else:
    print("[WARNING] GEMINI_API_KEY not found in environment variables")
    gemini_model = None

def get_legal_explanation(question, context_chunks, max_retries=3):
    """
    Get legal explanation from Gemini AI using retrieved context.
    """
    if not gemini_model:
        return {
            "error": "❌ AI service temporarily unavailable due to quota limits. Please try again later or use the search functionality to find relevant legal cases.",
            "answer": None,
            "sources": []
        }

    # Check if we have context, if not provide a helpful response
    if not context_chunks or len(context_chunks) == 0:
        return {
            "error": None,
            "answer": "I can help explain legal concepts in simple terms, but I need some context from legal cases to provide accurate information. Please use the main search form first to find relevant cases, then ask me specific questions about them.",
            "sources": []
        }

    # Build context from chunks
    context = "\n\n".join([
        f"[Source: {chunk.get('case', 'Unknown Case')}] {chunk.get('full_text', chunk.get('preview', ''))[:1000]}"
        for chunk in context_chunks
    ])

    # Detect question type for appropriate prompt
    question_lower = question.lower()

    # Check if user wants structured summary
    wants_structured = any(keyword in question_lower for keyword in [
        'structured summary', 'summary with sections', 'give a structured summary',
        'case background', 'high court', 'supreme court', 'why it matters'
    ])

    # Check if user wants layman's explanation
    wants_layman = any(keyword in question_lower for keyword in [
        'explain in simple terms', 'layman', 'non-law student', 'simple words',
        'easy explanation', 'plain english', 'everyday language'
    ])

    # Choose appropriate prompt based on question type
    if wants_structured:
        # 🔹 Prompt 3 – Structured Summary
        system_prompt = """You are a senior legal professional and expert in Indian law.
        Your task is to provide a structured summary of this PDF judgment that DIRECTLY ANSWERS the user's specific question.

        CRITICAL: Focus on answering what the user specifically asked about, not giving a generic summary.

        STRUCTURE YOUR RESPONSE BASED ON THE USER'S QUESTION:
        📌 Case background (only if relevant to their question)
        📌 Issue (main legal question they asked about)
        📌 High Court's decision (only if they asked about it)
        📌 Supreme Court's decision (only if they asked about it)
        📌 Why it matters (impact) (only if they asked about it)

        IMPORTANT RULES:
        1. Use only the provided context - do not add external knowledge
        2. If details are missing, say: "I couldn't find that information in the provided documents."
        3. Cite sources using [Case Name] format
        4. Simplify legal terms into everyday language
        5. Keep it professional, accurate, and complete
        6. Use emojis and clear formatting for better readability
        7. Structure with bullet points and short paragraphs
        8. Answer ONLY what they specifically asked about

        CONTEXT:
        {context}

        USER'S SPECIFIC QUESTION: {question}

        INSTRUCTIONS:
        - Read their question carefully
        - Only include sections that are relevant to their question
        - If they ask about legal sections, focus on those sections
        - If they ask for explanation of specific text, explain that text
        - Do not give generic summaries unless that's what they asked for

        Please provide a structured answer to their specific question:"""

    elif wants_layman:
        # 🔹 Prompt 4 – Layman's Understanding
        system_prompt = """You are a senior legal professional and expert in Indian law.
        Your task is to explain this PDF judgment in simple terms, as if explaining to a non-law student.

        CRITICAL: Focus on answering what the user specifically asked about, not giving a generic summary.

        STRUCTURE YOUR RESPONSE BASED ON THE USER'S QUESTION:
        📌 What the case was about (facts + background) - only if relevant to their question
        📌 What the High Court said - only if they asked about it
        📌 What the Supreme Court corrected - only if they asked about it
        📌 Why it matters (impact) - only if they asked about it

        IMPORTANT RULES:
        1. Use only the provided context - do not add external knowledge
        2. If something is not in the document, say: "I couldn't find that information in the provided documents."
        3. Cite sources using [Case Name] format
        4. Break down legal terms into plain words
        5. Keep it short, clear, professional, and complete
        6. Use emojis and clear formatting for better readability
        7. Structure with bullet points and short paragraphs
        8. Answer ONLY what they specifically asked about

        CONTEXT:
        {context}

        USER'S SPECIFIC QUESTION: {question}

        INSTRUCTIONS:
        - Read their question carefully
        - Only include sections that are relevant to their question
        - If they ask about legal sections, focus on those sections
        - If they ask for explanation of specific text, explain that text
        - Do not give generic summaries unless that's what they asked for

        Please provide a simple explanation that directly answers their specific question:"""

    else:
        # Default enhanced prompt for general questions
        system_prompt = """You are a senior legal professional and expert in Indian law.
        Your task is to ANSWER THE USER'S SPECIFIC QUESTION about the provided legal document in very simple, everyday words that even a 10th grader can understand.

        CRITICAL: You must directly address the user's specific question, not give a generic summary.

        IMPORTANT RULES:
        1. Always use only the provided context - do not add external knowledge
        2. If the answer is not in the context, say "I couldn't find that information in the provided documents."
        3. Always cite your sources using [Case Name] format
        4. Explain complex legal terms in simple words
        5. Be helpful, professional, and accurate
        6. Keep explanations concise but complete
        7. Structure your response with clear sections using emojis (📌, 👉, etc.) for better readability
        8. Use bullet points and short paragraphs for easy reading
        9. Make the response visually organized and scannable
        10. Focus on answering the EXACT question asked

        CONTEXT:
        {context}

        USER'S SPECIFIC QUESTION: {question}

        INSTRUCTIONS:
        - Read the user's question carefully
        - Answer ONLY what they asked about
        - If they ask about legal sections, explain those specific sections
        - If they ask for explanation of text, explain that specific text
        - Do not give generic case summaries unless specifically asked
        - Structure your answer to directly address their question

        Please provide a clear, structured answer to the user's specific question:"""

    prompt = system_prompt.format(context=context, question=question)

    for attempt in range(max_retries):
        try:
            response = gemini_model.generate_content(prompt)

            if response and response.text:
                # Extract sources from context
                sources = [chunk.get('case', 'Unknown Case') for chunk in context_chunks if chunk.get('case')]

                return {
                    "answer": response.text.strip(),
                    "sources": sources,
                    "error": None
                }
            else:
                return {
                    "error": "No response generated from AI model",
                    "answer": None,
                    "sources": []
                }

        except Exception as e:
            error_str = str(e)
            if attempt == max_retries - 1:
                # Provide helpful error messages based on error type
                if "quota" in error_str.lower() or "429" in error_str:
                    return {
                        "error": "❌ QUOTA EXCEEDED: Your Gemini API free tier limit has been reached. Please upgrade to a paid plan or wait for the quota to reset. See: https://ai.google.dev/pricing",
                        "answer": None,
                        "sources": []
                    }
                elif "api_key" in error_str.lower() or "permission" in error_str.lower():
                    return {
                        "error": "❌ API KEY ISSUE: Please check your Gemini API key in the .env file. Make sure it's valid and has the required permissions.",
                        "answer": None,
                        "sources": []
                    }
                else:
                    return {
                        "error": f"❌ AI service error after {max_retries} attempts: {error_str}",
                        "answer": None,
                        "sources": []
                    }
            continue

    return {
        "error": "Failed to get response from AI service",
        "answer": None,
        "sources": []
    }

# -------- Routes ----------
@app.route("/", methods=["GET", "POST"])
def index():
    # Prevent caching to ensure fresh page loads
    if request.method == "GET":
        response = make_response(render_template("index.html", results=None, category=None, original_document=None))
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        return response

    # Initialize variables - only set on POST requests
    results = None
    predicted_category = None
    original_document = None

    if request.method == "POST":
        input_text = request.form.get("text_input", "").strip()

        pdf_bytes = None
        if not input_text:
            # check for file in request
            uploaded = request.files.get("file")
            if not uploaded or uploaded.filename == "":
                return "❌ No input provided (paste text or upload a PDF).", 400

            # optional: strictly allow only .pdf extension
            if not uploaded.filename.lower().endswith(".pdf"):
                return "❌ Only PDF files are allowed.", 400

            # read file into memory (no saving)
            pdf_bytes = uploaded.read()
            if not pdf_bytes:
                return "❌ Uploaded file is empty.", 400

            # extract text from bytes
            input_text = read_pdf_from_bytes(pdf_bytes)

            # Check if PDF extraction failed
            if input_text.startswith("[ERROR]"):
                return f"❌ PDF processing failed: {input_text}", 400

        # Validate that we have input text
        if not input_text:
            return "❌ No text could be extracted from the input.", 400

        # Check minimum word count
        word_count = len(input_text.strip().split())
        if word_count < 5:
            return f"❌ Input text is too short. Please provide at least 5 words for meaningful analysis. Current: {word_count} words.", 400

        # get text after "JUDGMENT" if present
        start_index = input_text.find("JUDGMENT")
        text = input_text[start_index:] if start_index != -1 else input_text

        # predicted category
        try:
            predicted_category = modellog.predict([text])[0]
        except Exception as e:
            return f"❌ Error in category prediction: {str(e)}", 500

        # semantic search - top 5
        try:
            query_embedding = model.encode(text, convert_to_tensor=True)
            cos_scores = util.cos_sim(query_embedding, embeddings)[0]
            top_results = np.argsort(-cos_scores)[:5]
        except Exception as e:
            return f"❌ Error in semantic search: {str(e)}", 500

        results = []
        for idx in top_results:
            results.append({
                "case": case_names[idx],
                "score": float(cos_scores[idx]),
                "rank": len(results) + 1,
                "preview": judgment_texts[idx][:500],
                "full_text": judgment_texts[idx]
            })

        # Store the original document content for chatbot use BEFORE cleanup
        original_document = text if 'text' in locals() else (input_text if 'input_text' in locals() else None)

        # ********** PRIVACY: clean up large objects ASAP **********
        try:
            # remove sensitive text / bytes references
            del input_text
            del text
            # Clean up PDF bytes if they exist
            if 'pdf_bytes' in globals() or 'pdf_bytes' in locals():
                if 'pdf_bytes' in locals():
                    del pdf_bytes
                elif 'pdf_bytes' in globals():
                    del globals()['pdf_bytes']
            gc.collect()
        except Exception:
            pass

    # Handle GET requests (page reloads) - return clean page
    if request.method == "GET":
        print(f"DEBUG: GET request - returning clean page")
        response = make_response(render_template("index.html", results=None, category=None, original_document=None))
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate, max-age=0'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        response.headers['X-Accel-Expires'] = '0'
        return response

    # Handle POST requests (form submissions) - return with results
    print(f"DEBUG: POST request - results: {results is not None}, category: {predicted_category}, original_doc: {original_document is not None}")
    return render_template("index.html", results=results, category=predicted_category, original_document=original_document)

# -------- Test API Key Route ----------
@app.route("/test-api", methods=["GET"])
def test_api():
    """Test endpoint to check if Gemini API key is working"""
    if not gemini_model:
        return jsonify({
            "success": False,
            "error": "Gemini model not initialized",
            "api_key_set": GEMINI_API_KEY is not None,
            "api_key_preview": GEMINI_API_KEY[:10] + "..." if GEMINI_API_KEY else None
        })

    try:
        # Test with a simple request using the same model
        response = gemini_model.generate_content("Hello, can you respond with 'API test successful'?")
        if response and response.text:
            return jsonify({
                "success": True,
                "message": "API test successful",
                "response": response.text.strip()
            })
        else:
            return jsonify({
                "success": False,
                "error": "No response from API"
            })
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        })

# -------- Chatbot Route ----------
@app.route("/chat", methods=["POST"])
def chat():
    """
    Handle chatbot questions about legal cases.
    Expects JSON: {"question": "user question", "context": [list of case chunks]}
    """
    try:
        data = request.get_json()

        if not data or 'question' not in data:
            return jsonify({"success": False, "error": "Missing 'question' in request data"}), 400

        question = data['question'].strip()
        if not question:
            return jsonify({"success": False, "error": "Question cannot be empty"}), 400

        # Get context from request (should be the same chunks from the main search)
        context_chunks = data.get('context', [])

        print(f"DEBUG: Received {len(context_chunks)} context chunks")
        print(f"DEBUG: Context chunks: {context_chunks}")

        if not context_chunks:
            # Handle general legal questions without specific context
            print(f"DEBUG: No context chunks, question: '{question}'")  # Debug log
            if question.lower().strip() in ['hi', 'hello', 'hey', 'help', 'what can you do']:
                response_data = {
                    "success": True,
                    "response": "Hello! I'm your legal assistant. I can help explain your uploaded legal documents in simple, everyday language with clear, structured responses using emojis and sections. Please upload a document first using the main form, then ask me specific questions about it. For example: 'What does this mean?', 'Explain this in simple words', 'Give me a structured summary', or 'Explain this like I'm not a law student.'"
                }
                print(f"DEBUG: Returning greeting response: {response_data}")  # Debug log
                return jsonify(response_data)
            else:
                response_data = {
                    "success": True,
                    "response": "I can help explain legal concepts in simple terms with clear, structured responses using emojis and sections, but I need some context from your uploaded document to provide accurate information. Please upload a document first using the main form, then ask me specific questions about it. Try: 'Give me a structured summary' or 'Explain this in simple terms like I'm not a law student.'"
                }
                print(f"DEBUG: Returning general response: {response_data}")  # Debug log
                return jsonify(response_data)

        # Get legal explanation from Gemini
        result = get_legal_explanation(question, context_chunks)

        if result['error']:
            return jsonify({"success": False, "error": result['error']}), 500

        return jsonify({
            "success": True,
            "response": result['answer'],
            "sources": result.get('sources', [])
        })

    except Exception as e:
        return jsonify({"success": False, "error": f"Chatbot error: {str(e)}"}), 500

# handle oversized uploads
@app.errorhandler(RequestEntityTooLarge)
def handle_over_max(e):
    return "Uploaded file is too large. Max size allowed is 10 MB.", 413

# -------- Run ----------
if __name__ == "__main__":
    # Development mode with live reloading
    port = int(os.environ.get("PORT", 7860))  # HF Spaces uses PORT env variable

    # Check if we're in development (not on HF Spaces)
    is_development = os.environ.get("PORT") is None

    if is_development:
        # Development: Enable debug mode and live reloading
        print("[INFO] Starting in DEVELOPMENT mode with live reloading...")
        print("[INFO] Edit templates, static files, or Python code - changes will auto-reload!")
        app.run(host="0.0.0.0", port=port, debug=True, use_reloader=True)
    else:
        # Production: HF Spaces mode
        print("[INFO] Starting in PRODUCTION mode...")
        app.run(host="0.0.0.0", port=port)
