// LexiMind JavaScript - All functionality in one file

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const form = document.querySelector('form');
    const textInput = document.querySelector('textarea[name="text_input"]');
    const submitButton = document.querySelector('button[type="submit"]');
    const themeToggle = document.getElementById('theme-toggle');
    const body = document.body;

    // Drag & Drop Elements
    const uploadZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-input');
    const filePreview = document.getElementById('file-preview');
    const fileName = document.getElementById('file-name');
    const fileSize = document.getElementById('file-size');
    const removeFileBtn = document.getElementById('remove-file');

    // Modal Elements
    const caseModal = document.getElementById('case-modal');
    const modalClose = document.getElementById('modal-close');
    const modalCloseBottom = document.getElementById('modal-close-bottom');
    const modalCopy = document.getElementById('modal-copy');
    const modalCaseTitle = document.getElementById('modal-case-title');
    const modalCaseName = document.getElementById('modal-case-name');
    const modalSimilarity = document.getElementById('modal-similarity');
    const modalRank = document.getElementById('modal-rank');
    const modalCaseContent = document.getElementById('modal-case-content');

    // Loading Elements
    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingSkeletons = document.getElementById('loading-skeletons');

    // Filter/Sort Elements
    const resultsControls = document.getElementById('results-controls');
    const resultsContainer = document.getElementById('results-container');
    const sortSelect = document.getElementById('sort-select');
    const filterSelect = document.getElementById('filter-select');
    const visibleResultsSpan = document.getElementById('visible-results');
    const totalResultsSpan = document.getElementById('total-results-2');
    const noResultsDiv = document.getElementById('no-results');

    // State variables
    let originalResults = [];
    let currentResults = [];

    // Utility Functions
    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const updateButtonState = () => {
        const isTextFilled = textInput.value.trim() !== '';
        const isFileSelected = fileInput.files.length > 0;

        if (isTextFilled || isFileSelected) {
            submitButton.removeAttribute('disabled');
            submitButton.classList.remove('bg-gray-400', 'cursor-not-allowed');
        } else {
            submitButton.setAttribute('disabled', 'true');
            submitButton.classList.add('bg-gray-400', 'cursor-not-allowed');
        }
    };

    // Loading State Functions
    const showLoadingState = () => {
        const existingResults = document.querySelector('.result-section:not(#loading-skeletons)');

        // Hide existing results
        if (existingResults) {
            existingResults.classList.add('hidden');
        }

        // Show loading overlay and skeletons
        loadingOverlay.classList.remove('hidden');
        loadingOverlay.classList.add('flex');
        loadingSkeletons.classList.remove('hidden');

        // Show custom hand loading animation
        const handLoading = document.getElementById('hand-loading');
        if (handLoading) {
            handLoading.classList.add('show');
        }

        // Update button
        submitButton.innerHTML = `<svg class="animate-spin h-5 w-5 mr-3 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg> Analyzing...`;
        submitButton.setAttribute('disabled', 'true');
        submitButton.classList.add('opacity-75', 'cursor-wait');
    };

    const hideLoadingState = () => {
        // Hide loading states
        loadingOverlay.classList.add('hidden');
        loadingOverlay.classList.remove('flex');
        loadingSkeletons.classList.add('hidden');

        // Hide custom hand loading animation
        const handLoading = document.getElementById('hand-loading');
        if (handLoading) {
            handLoading.classList.remove('show');
        }

        // Reset button
        submitButton.innerHTML = 'Analyze';
        submitButton.removeAttribute('disabled');
        submitButton.classList.remove('opacity-75', 'cursor-wait');
    };

    // File Handling Functions
    const showFilePreview = (file) => {
        fileName.textContent = file.name;
        fileSize.textContent = formatFileSize(file.size);
        filePreview.classList.add('show');
        uploadZone.style.display = 'none';
    };

    const hideFilePreview = () => {
        filePreview.classList.remove('show');
        uploadZone.style.display = 'block';
        fileInput.value = '';
    };

    const handleFileSelect = (file) => {
        if (file && file.type === 'application/pdf') {
            // Clear text input when file is selected
            textInput.value = '';
            showFilePreview(file);
        } else if (file) {
            alert('Please select a PDF file only.');
        }
        updateButtonState();
    };

    // Modal Functions
    const showModal = (caseData) => {
        modalCaseTitle.textContent = caseData.case;
        modalCaseName.textContent = caseData.case;
        modalSimilarity.textContent = `${(parseFloat(caseData.score) * 100).toFixed(1)}%`;
        modalRank.textContent = caseData.rank || '-';
        modalCaseContent.textContent = caseData.preview;

        caseModal.classList.remove('hidden');
        caseModal.classList.add('show');
        document.body.style.overflow = 'hidden';
    };

    const hideModal = () => {
        caseModal.classList.add('hidden');
        caseModal.classList.remove('show');
        document.body.style.overflow = '';
    };

    // Results Functions
    const initializeSimilarityBars = () => {
        const similarityFills = document.querySelectorAll('.similarity-fill');
        similarityFills.forEach(fill => {
            const score = parseFloat(fill.dataset.score);
            const percentage = Math.round(score * 100);
            fill.style.width = percentage + '%';
        });
    };

    const initializeResults = () => {
        const resultCards = document.querySelectorAll('.result-card');
        originalResults = Array.from(resultCards).map((card, index) => ({
            element: card,
            case: card.querySelector('h4').textContent,
            score: parseFloat(card.querySelector('.similarity-fill').dataset.score),
            rank: index + 1
        }));
        currentResults = [...originalResults];

        if (originalResults.length > 0) {
            resultsControls.classList.remove('hidden');
            resultsControls.classList.add('flex');
        }
    };

    const sortResults = (sortType) => {
        currentResults.sort((a, b) => {
            switch (sortType) {
                case 'similarity-desc':
                    return b.score - a.score;
                case 'similarity-asc':
                    return a.score - b.score;
                case 'name-asc':
                    return a.case.localeCompare(b.case);
                case 'name-desc':
                    return b.case.localeCompare(a.case);
                default:
                    return 0;
            }
        });
    };

    const filterResults = (minScore) => {
        return originalResults.filter(result => result.score >= minScore);
    };

    const updateResultsDisplay = () => {
        // Clear container
        const existingCards = resultsContainer.querySelectorAll('.result-card');
        existingCards.forEach(card => card.remove());

        // Hide no results message
        noResultsDiv.classList.add('hidden');

        if (currentResults.length === 0) {
            noResultsDiv.classList.remove('hidden');
        } else {
            // Add filtered and sorted results
            currentResults.forEach((result, index) => {
                const card = result.element.cloneNode(true);
                // Update rank badge
                const rankBadge = card.querySelector('.rank-badge');
                if (rankBadge) {
                    rankBadge.textContent = `#${index + 1}`;
                }
                resultsContainer.appendChild(card);
            });
        }

        // Update counters
        visibleResultsSpan.textContent = currentResults.length;
        totalResultsSpan.textContent = originalResults.length;

        // Re-initialize similarity bars and event listeners
        initializeSimilarityBars();
    };

    // Case Details Modal Functions
    const showCaseDetails = (caseName, score, rank, content) => {
        console.log('showCaseDetails called with:', { caseName, score, rank, content }); // Debug log

        const modal = document.getElementById('case-modal');
        const modalTitle = document.getElementById('modal-case-title');
        const modalSimilarity = document.getElementById('modal-similarity');
        const modalRank = document.getElementById('modal-rank');
        const modalContent = document.getElementById('modal-case-content');

        console.log('Modal elements found:', { modal, modalTitle, modalSimilarity, modalRank, modalContent }); // Debug log

        if (modal && modalTitle && modalSimilarity && modalRank && modalContent) {
            modalTitle.textContent = caseName;
            modalSimilarity.textContent = `${(parseFloat(score) * 100).toFixed(1)}%`;
            modalRank.textContent = `#${rank}`;
            modalContent.textContent = content;

            modal.classList.remove('hidden');
            modal.classList.add('show');
            document.body.style.overflow = 'hidden';
            console.log('Modal should now be visible'); // Debug log
        } else {
            console.error('Some modal elements not found!'); // Error log
        }
    };

    const hideCaseModal = () => {
        const modal = document.getElementById('case-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('show');
            document.body.style.overflow = '';
        }
    };

    // Test function to debug modal functionality
    window.testModal = () => {
        console.log('Testing modal...');
        showCaseDetails('Test Case', '0.95', '1', 'This is a test case content to verify that the modal is working correctly. If you can see this, the modal functionality is working!');
    };

    // Event Handlers
    const handleFormSubmission = async (event) => {
        event.preventDefault(); // Prevent default form submission

        const formData = new FormData(form);

        // Show loading state
        showLoadingState();

        try {
            const response = await fetch('/', {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                const html = await response.text();
                document.documentElement.innerHTML = html; // Replace entire page content
                // Re-initialize JavaScript after page load
                if (window.initializeAfterLoad) {
                    window.initializeAfterLoad();
                }
            } else {
                throw new Error('Server error');
            }
        } catch (error) {
            console.error('Error:', error);
            hideLoadingState();
            alert('An error occurred while processing your request. Please try again.');
        }
    };

    const handleInput = (event) => {
        if (event.target === textInput) {
            if (textInput.value.trim() !== '') {
                hideFilePreview();
            }
        }
        updateButtonState();
    };

    const toggleTheme = () => {
        body.classList.toggle('dark-mode');
        const isDarkMode = body.classList.contains('dark-mode');
        themeToggle.textContent = isDarkMode ? '☀️' : '🌙';
        localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    };

    const loadTheme = () => {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            body.classList.add('dark-mode');
            themeToggle.textContent = '☀️';
        } else {
            themeToggle.textContent = '🌙';
        }
    };

    const handleSortChange = () => {
        const sortType = sortSelect.value;
        sortResults(sortType);
        updateResultsDisplay();
    };

    const handleFilterChange = () => {
        const minScore = parseFloat(filterSelect.value);
        currentResults = filterResults(minScore);
        const sortType = sortSelect.value;
        sortResults(sortType);
        updateResultsDisplay();
    };

    const handleViewDetails = (event) => {
        const button = event.target.closest('.view-details');
        if (button) {
            const caseData = {
                case: button.dataset.case,
                preview: button.dataset.preview,
                score: button.dataset.score,
                rank: button.closest('.result-card').querySelector('.rank-badge').textContent
            };
            showModal(caseData);
        }
    };

    const handleCopyText = (event) => {
        const button = event.target.closest('.copy-text');
        if (button) {
            const text = button.dataset.preview;
            navigator.clipboard.writeText(text).then(() => {
                // Show temporary success feedback
                const originalText = button.textContent;
                button.textContent = '✅ Copied!';
                button.style.backgroundColor = '#10b981';
                setTimeout(() => {
                    button.textContent = originalText;
                    button.style.backgroundColor = '';
                }, 2000);
            });
        }
    };

    // Drag & Drop Event Handlers
    uploadZone.addEventListener('click', () => {
        fileInput.click();
    });

    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });

    uploadZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
    });

    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileSelect(files[0]);
        }
    });

    // File Input Event Handler
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileSelect(e.target.files[0]);
        }
    });

    // Remove File Event Handler
    removeFileBtn.addEventListener('click', hideFilePreview);

    // Modal Event Handlers
    modalClose.addEventListener('click', hideModal);
    modalCloseBottom.addEventListener('click', hideModal);
    caseModal.addEventListener('click', (e) => {
        if (e.target === caseModal) {
            hideModal();
        }
    });

    // Modal Copy Event Handler
    modalCopy.addEventListener('click', () => {
        const content = modalCaseContent.textContent;
        navigator.clipboard.writeText(content).then(() => {
            const originalText = modalCopy.textContent;
            modalCopy.textContent = '✅ Copied!';
            modalCopy.style.backgroundColor = '#10b981';
            setTimeout(() => {
                modalCopy.textContent = originalText;
                modalCopy.style.backgroundColor = '';
            }, 2000);
        });
    });

    // Escape Key Handler for Modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && caseModal.classList.contains('show')) {
            hideModal();
        }
    });

    // Filter/Sort Event Handlers
    sortSelect.addEventListener('change', handleSortChange);
    filterSelect.addEventListener('change', handleFilterChange);

    // Main Event Listeners
    textInput.addEventListener('input', handleInput);
    fileInput.addEventListener('change', handleInput);
    form.addEventListener('submit', handleFormSubmission);
    themeToggle.addEventListener('click', toggleTheme);

    // Case Details Event Listeners
    document.addEventListener('click', (event) => {
        // Handle case title clicks
        if (event.target.classList.contains('case-title')) {
            const caseData = event.target.dataset;
            console.log('Case title clicked:', caseData); // Debug log
            console.log('Case title element:', event.target); // Debug log
            showCaseDetails(caseData.case, caseData.score, caseData.rank, caseData.content);
        }

        // Handle view details button clicks
        if (event.target.classList.contains('view-details-btn')) {
            const caseData = event.target.dataset;
            console.log('View details button clicked:', caseData); // Debug log
            console.log('View details button element:', event.target); // Debug log
            showCaseDetails(caseData.case, caseData.score, caseData.rank, caseData.content);
        }

        // Handle modal close buttons
        if (event.target.id === 'modal-close' || event.target.id === 'modal-close-bottom') {
            hideCaseModal();
        }

        // Handle modal overlay click (close when clicking outside)
        if (event.target.id === 'case-modal') {
            hideCaseModal();
        }
    });

    // Add specific event listeners for case elements
    document.addEventListener('DOMContentLoaded', () => {
        // Add click listeners to case titles
        const caseTitles = document.querySelectorAll('.case-title');
        console.log('Found case titles:', caseTitles.length); // Debug log
        caseTitles.forEach((title, index) => {
            console.log(`Case title ${index}:`, title, 'Data:', title.dataset); // Debug log
            title.addEventListener('click', (event) => {
                console.log('Case title click event triggered!', event.target.dataset); // Debug log
                const caseData = event.target.dataset;
                showCaseDetails(caseData.case, caseData.score, caseData.rank, caseData.content);
            });
        });

        // Add click listeners to view details buttons
        const viewButtons = document.querySelectorAll('.view-details-btn');
        console.log('Found view details buttons:', viewButtons.length); // Debug log
        viewButtons.forEach((button, index) => {
            console.log(`View button ${index}:`, button, 'Data:', button.dataset); // Debug log
            button.addEventListener('click', (event) => {
                console.log('View details button click event triggered!', event.target.dataset); // Debug log
                const caseData = event.target.dataset;
                showCaseDetails(caseData.case, caseData.score, caseData.rank, caseData.content);
            });
        });
    });

    // Handle escape key for modal
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            const modal = document.getElementById('case-modal');
            if (modal && modal.classList.contains('show')) {
                hideCaseModal();
            }
        }
    });

    // Result Action Event Listeners
    document.addEventListener('click', (event) => {
        if (event.target.closest('.view-details')) {
            handleViewDetails(event);
        } else if (event.target.closest('.copy-text')) {
            handleCopyText(event);
        }
    });

    // Initialization
    const checkForResultsAndInitialize = () => {
        if (document.querySelector('.result-card')) {
            setTimeout(initializeResults, 100); // Small delay to ensure DOM is ready
        }
    };

    const checkForResults = () => {
        const hasResults = document.querySelector('.result-section:not(#loading-skeletons)') !== null;
        const hasCategory = document.querySelector('.result-section') !== null;

        if (hasResults || hasCategory) {
            hideLoadingState();
        }
    };

    // Debug function to check case elements
    window.debugCaseElements = () => {
        console.log('=== DEBUGGING CASE ELEMENTS ===');
        const caseTitles = document.querySelectorAll('.case-title');
        const viewButtons = document.querySelectorAll('.view-details-btn');

        console.log('Case titles found:', caseTitles.length);
        caseTitles.forEach((title, index) => {
            console.log(`Title ${index}:`, {
                element: title,
                text: title.textContent.substring(0, 50) + '...',
                data: title.dataset
            });
        });

        console.log('View buttons found:', viewButtons.length);
        viewButtons.forEach((button, index) => {
            console.log(`Button ${index}:`, {
                element: button,
                text: button.textContent,
                data: button.dataset
            });
        });
        console.log('=== END DEBUG ===');
    };

    // Function to re-initialize after AJAX page load
    window.initializeAfterLoad = () => {
        // Re-initialize theme
        const savedTheme = localStorage.getItem('theme');
        const themeToggle = document.getElementById('theme-toggle');
        const body = document.body;

        if (savedTheme === 'dark') {
            body.classList.add('dark-mode');
            if (themeToggle) themeToggle.checked = true;
        } else {
            if (themeToggle) themeToggle.checked = false;
        }

        // Re-initialize similarity bars
        const similarityFills = document.querySelectorAll('.similarity-fill');
        if (similarityFills.length > 0) {
            similarityFills.forEach(fill => {
                const score = parseFloat(fill.dataset.score);
                const percentage = Math.round(score * 100);
                fill.style.width = percentage + '%';
            });
        }

        // Hide loading state if results are present
        const hasResults = document.querySelector('.result-section:not(#loading-skeletons)') !== null;
        const hasCategory = document.querySelector('.result-section') !== null;

        if (hasResults || hasCategory) {
            const loadingOverlay = document.getElementById('loading-overlay');
            const loadingSkeletons = document.getElementById('loading-skeletons');
            const handLoading = document.getElementById('hand-loading');

            if (loadingOverlay) {
                loadingOverlay.classList.add('hidden');
                loadingOverlay.classList.remove('flex');
            }
            if (loadingSkeletons) {
                loadingSkeletons.classList.add('hidden');
            }
            if (handLoading) {
                handLoading.classList.remove('show');
            }

            // Reset button
            const submitButton = document.querySelector('button[type="submit"]');
            if (submitButton) {
                submitButton.innerHTML = 'Analyze';
                submitButton.removeAttribute('disabled');
                submitButton.classList.remove('opacity-75', 'cursor-wait');
            }
        }
    };

    // Initialize everything
    loadTheme();
    updateButtonState();
    initializeSimilarityBars();
    checkForResults();
    checkForResultsAndInitialize();
});