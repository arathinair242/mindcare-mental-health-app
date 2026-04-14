// Global hideLoader function so data-dependent pages can trigger it manually
window.hideLoader = function (enforceDelay = false) {
    const loader = document.querySelector('.page-loader');
    if (!loader) return;

    // Check if this is the landing page loader (which has a 2s delay)
    const isLandingLoader = loader.querySelector('.loader-text-anim') !== null || loader.querySelector('.loader-wave-text') !== null;
    const delay = (isLandingLoader && enforceDelay) ? 2000 : 0;

    setTimeout(() => {
        loader.classList.add('fade-out');
        setTimeout(() => {
            loader.style.display = 'none';
        }, 500); // Wait for CSS opacity transition
    }, delay);
};

document.addEventListener('DOMContentLoaded', () => {
    const menuToggle = document.querySelector('.menu-toggle');
    const navLinks = document.querySelector('.nav-links');
    const navActions = document.querySelector('.nav-actions');

    if (menuToggle && navLinks) {
        menuToggle.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            if (navActions) navActions.classList.toggle('active');
            
            // Toggle hamburger icon to X
            const icon = menuToggle.querySelector('i');
            if (icon.classList.contains('ri-menu-line')) {
                icon.classList.remove('ri-menu-line');
                icon.classList.add('ri-close-line');
            } else {
                icon.classList.remove('ri-close-line');
                icon.classList.add('ri-menu-line');
            }
        });
    }

    // Navbar scroll effect
    const navbar = document.querySelector('.navbar');

    window.addEventListener('scroll', () => {
        if (!navbar) return;
        if (window.scrollY > 20) {
            navbar.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
            navbar.style.borderBottom = 'none';
        } else {
            navbar.style.boxShadow = 'none';
            navbar.style.borderBottom = '1px solid rgba(0,0,0,0.05)';
        }
    });

    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();

            const targetId = this.getAttribute('href');
            if (targetId === '#') return;

            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                const headerOffset = 80; // navbar height
                const elementPosition = targetElement.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

                window.scrollTo({
                    top: offsetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });

    // Subtly animate elements on scroll
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.1
    };

    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = 1;
                entry.target.style.transform = 'translateY(0)';
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    const featureCards = document.querySelectorAll('.feature-card');
    featureCards.forEach((card, index) => {
        card.style.opacity = 0;
        card.style.transform = 'translateY(20px)';
        card.style.transition = `all 0.5s ease ${index * 0.1}s`;
        observer.observe(card);
    });

    // FAQ Accordion
    const faqQuestions = document.querySelectorAll('.faq-question');

    faqQuestions.forEach(question => {
        question.addEventListener('click', () => {
            const item = question.parentElement;
            const answer = item.querySelector('.faq-answer');
            const isActive = item.classList.contains('active');

            // Close all items
            document.querySelectorAll('.faq-item').forEach(faqItem => {
                faqItem.classList.remove('active');
                faqItem.querySelector('.faq-answer').style.maxHeight = null;
            });

            // If the clicked item wasn't active, open it
            if (!isActive) {
                item.classList.add('active');
                answer.style.maxHeight = answer.scrollHeight + 'px';
            }
        });
    });

    // --- Assessment Logic (Page-based or Modal-based) ---
    const assessmentContainer = document.getElementById('assessment-container') || document.getElementById('assessment-modal');

    if (assessmentContainer) {
        let currentStep = 1;
        const steps = assessmentContainer.querySelectorAll('.assessment-step');
        const totalSteps = steps.length;
        const progressBar = assessmentContainer.querySelector('#assessment-progress');
        const currentStepIndicator = assessmentContainer.querySelector('#current-step');
        const nextBtn = assessmentContainer.querySelector('#assessment-next') || assessmentContainer.querySelector('#btn-next');
        const prevBtn = assessmentContainer.querySelector('#assessment-prev') || assessmentContainer.querySelector('#btn-back');
        const modalOverlay = document.getElementById('assessment-modal');
        const closeBtn = assessmentContainer.querySelector('.modal-close');

        const updateAssessmentState = () => {
            // Update steps visibility
            steps.forEach((step, index) => {
                if (index === currentStep - 1) {
                    step.classList.add('active');
                } else {
                    step.classList.remove('active');
                }
            });

            // Update progress bar
            if (progressBar) {
                progressBar.style.width = `${(currentStep / totalSteps) * 100}%`;
            }
            if (currentStepIndicator) {
                currentStepIndicator.textContent = currentStep;
            }

            // Update buttons
            if (prevBtn) {
                if (currentStep === 1) {
                    prevBtn.disabled = true;
                    prevBtn.style.visibility = 'hidden';
                } else if (currentStep === totalSteps) {
                    prevBtn.style.display = 'none';
                } else {
                    prevBtn.disabled = false;
                    prevBtn.style.visibility = 'visible';
                    prevBtn.style.display = 'block';
                }
            }

            if (nextBtn) {
                if (currentStep === totalSteps) {
                    nextBtn.textContent = 'View Matches';
                    // Let the assessment page script handle this
                    nextBtn.onclick = () => window.location.href = 'signup.html';
                } else {
                    nextBtn.textContent = 'Next Step';
                    nextBtn.onclick = null;
                }
            }
        };

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                if (currentStep < totalSteps) {
                    currentStep++;
                    updateAssessmentState();
                }
            });
        }

        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                if (currentStep > 1) {
                    currentStep--;
                    updateAssessmentState();
                }
            });
        }

        // Modal specific logic if still present
        if (modalOverlay) {
            const openBtns = document.querySelectorAll('.btn-assessment');
            openBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    // Only prevent default if it's meant to open a modal on the same page
                    if (btn.getAttribute('href') === '#' || btn.getAttribute('href') === '') {
                        e.preventDefault();
                        modalOverlay.classList.add('active');
                        document.body.style.overflow = 'hidden';
                    }
                });
            });

            const closeModal = () => {
                modalOverlay.classList.remove('active');
                document.body.style.overflow = '';
                currentStep = 1;
                updateAssessmentState();
            };

            if (closeBtn) closeBtn.addEventListener('click', closeModal);
            modalOverlay.addEventListener('click', (e) => {
                if (e.target === modalOverlay) closeModal();
            });
        }

        // Initialize state
        updateAssessmentState();
    }
});
