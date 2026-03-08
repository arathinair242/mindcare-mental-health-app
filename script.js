document.addEventListener('DOMContentLoaded', () => {
    // Navbar scroll effect
    const navbar = document.querySelector('.navbar');
    
    window.addEventListener('scroll', () => {
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

    // Assessment Modal Logic
    const modal = document.getElementById('assessment-modal');
    const openBtns = document.querySelectorAll('a[href="#"], .btn-primary:not([type="submit"])');
    const closeBtn = document.querySelector('.modal-close');
    const nextBtn = document.getElementById('btn-next');
    const backBtn = document.getElementById('btn-back');
    const steps = document.querySelectorAll('.assessment-step');
    const progressBar = document.getElementById('assessment-progress');
    const currentStepIndicator = document.getElementById('current-step');
    
    let currentStep = 1;
    const totalSteps = 4;

    // Open/Close Modal
    openBtns.forEach(btn => {
        // Only target buttons that don't have a specific anchor tag
        if (btn.getAttribute('href') === '#' || (!btn.hasAttribute('href') && !btn.closest('form'))) {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                modal.classList.add('active');
                document.body.style.overflow = 'hidden'; // Prevent background scrolling
            });
        }
    });

    const closeModal = () => {
        modal.classList.remove('active');
        document.body.style.overflow = '';
        setTimeout(resetModal, 300); // Reset after closing animation
    };

    closeBtn.addEventListener('click', closeModal);
    
    // Close on clicking outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });

    // Navigation logic
    const updateModalState = () => {
        // Update steps visibility
        steps.forEach((step, index) => {
            if (index === currentStep - 1) {
                step.classList.add('active');
            } else {
                step.classList.remove('active');
            }
        });

        // Update progress bar
        progressBar.style.width = `${(currentStep / totalSteps) * 100}%`;
        currentStepIndicator.textContent = currentStep;

        // Update buttons
        if (currentStep === 1) {
            backBtn.disabled = true;
            nextBtn.textContent = 'Next Step';
            nextBtn.style.display = 'block';
        } else if (currentStep === totalSteps) {
            backBtn.disabled = true;
            backBtn.style.display = 'none';
            nextBtn.textContent = 'Done';
        } else {
            backBtn.disabled = false;
            backBtn.style.display = 'block';
            nextBtn.textContent = 'Next Step';
            nextBtn.style.display = 'block';
        }
    };

    nextBtn.addEventListener('click', () => {
        if (currentStep < totalSteps) {
            currentStep++;
            updateModalState();
        } else {
            closeModal();
        }
    });

    backBtn.addEventListener('click', () => {
        if (currentStep > 1) {
            currentStep--;
            updateModalState();
        }
    });

    const resetModal = () => {
        currentStep = 1;
        updateModalState();
        
        // Uncheck inputs
        document.querySelectorAll('.modal-container input[type="radio"], .modal-container input[type="checkbox"]').forEach(input => {
            input.checked = false;
        });
        document.querySelectorAll('.modal-container select, .modal-container input[type="email"]').forEach(input => {
            input.value = '';
        });
    };
});
