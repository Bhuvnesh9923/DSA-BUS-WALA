/* ========================================
   TrackMate - Landing Page JavaScript
   ======================================== */

document.addEventListener('DOMContentLoaded', function() {
    
    // ========================================
    // Navbar Scroll Effect
    // ========================================
    const navbar = document.getElementById('mainNav');
    
    function handleNavbarScroll() {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    }
    
    window.addEventListener('scroll', handleNavbarScroll);
    handleNavbarScroll(); // Check on load
    
    // ========================================
    // Smooth Scroll for Navigation Links
    // ========================================
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            
            if (targetId === '#') return;
            
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                const navbarHeight = navbar.offsetHeight;
                const targetPosition = targetElement.getBoundingClientRect().top + window.pageYOffset - navbarHeight;
                
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
                
                // Close mobile menu if open
                const navbarCollapse = document.querySelector('.navbar-collapse');
                if (navbarCollapse.classList.contains('show')) {
                    const bsCollapse = new bootstrap.Collapse(navbarCollapse);
                    bsCollapse.hide();
                }
            }
        });
    });
    
    // ========================================
    // Back to Top Button
    // ========================================
    const backToTopBtn = document.getElementById('backToTop');
    
    function handleBackToTop() {
        if (window.scrollY > 400) {
            backToTopBtn.classList.add('visible');
        } else {
            backToTopBtn.classList.remove('visible');
        }
    }
    
    window.addEventListener('scroll', handleBackToTop);
    
    backToTopBtn.addEventListener('click', function() {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
    
    // ========================================
    // Animate Elements on Scroll
    // ========================================
    const animateElements = document.querySelectorAll(
        '.problem-card, .feature-card, .step-card, .user-card, .benefit-item, .audience-card, .tech-item'
    );
    
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.1
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);
    
    animateElements.forEach((el, index) => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = `all 0.6s ease ${index * 0.1}s`;
        observer.observe(el);
    });
    
    // ========================================
    // Counter Animation for Stats
    // ========================================
    function animateCounter(element, target, duration = 2000) {
        let start = 0;
        const increment = target / (duration / 16);
        
        function updateCounter() {
            start += increment;
            if (start < target) {
                element.textContent = Math.floor(start);
                requestAnimationFrame(updateCounter);
            } else {
                element.textContent = target;
            }
        }
        
        updateCounter();
    }
    
    // Animate stats when they come into view
    const statNumbers = document.querySelectorAll('.stat-number, .benefit-stat');
    const statsObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !entry.target.classList.contains('animated')) {
                entry.target.classList.add('animated');
                const text = entry.target.textContent.trim();
                const number = parseInt(text.replace(/\D/g, ''));
                
                // Skip non-numeric stats like "24/7", "< 30s", percentages, etc.
                if (number && !text.includes('%') && !text.includes('Real') && !text.includes('/') && !text.includes('<')) {
                    animateCounter(entry.target, number);
                }
            }
        });
    }, { threshold: 0.5 });
    
    statNumbers.forEach(stat => statsObserver.observe(stat));
    
    // ========================================
    // Bus Marker Animation on Hero
    // ========================================
    const busMarker = document.querySelector('.bus-marker');
    if (busMarker) {
        let position = 30;
        let direction = 1;
        
        setInterval(() => {
            position += direction * 0.5;
            
            if (position >= 75) {
                direction = -1;
            } else if (position <= 20) {
                direction = 1;
            }
            
            busMarker.style.left = `${position}%`;
        }, 100);
    }
    
    // ========================================
    // ETA Counter Animation
    // ========================================
    const etaValue = document.querySelector('.eta-value');
    if (etaValue) {
        let eta = 5;
        
        setInterval(() => {
            eta = Math.max(1, eta - 1);
            if (eta === 1) {
                eta = Math.floor(Math.random() * 5) + 3;
            }
            etaValue.textContent = eta;
        }, 3000);
    }
    
    // ========================================
    // Contact Form Handling with Web3Forms
    // ========================================
    const contactForm = document.getElementById('contactForm');
    
    if (contactForm) {
        contactForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const submitBtn = this.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;
            
            // Show loading state
            submitBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Sending...';
            submitBtn.disabled = true;
            
            try {
                const response = await fetch('https://api.web3forms.com/submit', {
                    method: 'POST',
                    body: new FormData(this)
                });
                
                const result = await response.json();
                
                if (result.success) {
                    // Success state
                    submitBtn.innerHTML = '<i class="bi bi-check-circle"></i> Message Sent!';
                    submitBtn.classList.remove('btn-primary');
                    submitBtn.classList.add('btn-success');
                    
                    // Reset form after delay
                    setTimeout(() => {
                        submitBtn.innerHTML = originalText;
                        submitBtn.disabled = false;
                        submitBtn.classList.remove('btn-success');
                        submitBtn.classList.add('btn-primary');
                        this.reset();
                    }, 3000);
                } else {
                    throw new Error(result.message || 'Something went wrong');
                }
            } catch (error) {
                // Error state
                submitBtn.innerHTML = '<i class="bi bi-x-circle"></i> Failed to Send';
                submitBtn.classList.remove('btn-primary');
                submitBtn.classList.add('btn-danger');
                
                setTimeout(() => {
                    submitBtn.innerHTML = originalText;
                    submitBtn.disabled = false;
                    submitBtn.classList.remove('btn-danger');
                    submitBtn.classList.add('btn-primary');
                }, 3000);
                
                console.error('Form submission error:', error);
            }
        });
    }
    
    // Check for success redirect parameter
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('success') === 'true') {
        // Show success toast/notification
        const toast = document.createElement('div');
        toast.className = 'position-fixed bottom-0 end-0 p-3';
        toast.style.zIndex = '9999';
        toast.innerHTML = `
            <div class="toast show align-items-center text-white bg-success border-0" role="alert">
                <div class="d-flex">
                    <div class="toast-body">
                        <i class="bi bi-check-circle me-2"></i> Thank you! Your message has been sent successfully.
                    </div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
                </div>
            </div>
        `;
        document.body.appendChild(toast);
        
        // Remove success param from URL
        window.history.replaceState({}, document.title, window.location.pathname);
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            toast.remove();
        }, 5000);
    }
    
    // ========================================
    // Notification Stack Animation
    // ========================================
    const notificationItems = document.querySelectorAll('.notification-item');
    
    if (notificationItems.length > 0) {
        let currentIndex = 0;
        
        // Initially hide all but first
        notificationItems.forEach((item, index) => {
            if (index !== 0) {
                item.style.opacity = '0.5';
                item.style.transform = 'scale(0.95)';
            }
        });
        
        setInterval(() => {
            // Reset all
            notificationItems.forEach(item => {
                item.style.opacity = '0.5';
                item.style.transform = 'scale(0.95)';
            });
            
            // Highlight current
            currentIndex = (currentIndex + 1) % notificationItems.length;
            notificationItems[currentIndex].style.opacity = '1';
            notificationItems[currentIndex].style.transform = 'scale(1)';
        }, 2500);
    }
    
    // ========================================
    // Lifecycle Stage Animation
    // ========================================
    const lifecycleStages = document.querySelectorAll('.lifecycle-stage');
    
    if (lifecycleStages.length > 0) {
        let activeStage = 0;
        
        setInterval(() => {
            lifecycleStages.forEach((stage, index) => {
                stage.style.opacity = index <= activeStage ? '1' : '0.4';
                stage.style.transform = index === activeStage ? 'scale(1.1)' : 'scale(1)';
            });
            
            activeStage = (activeStage + 1) % lifecycleStages.length;
        }, 1500);
    }
    
    // ========================================
    // Parallax Effect for Hero
    // ========================================
    const heroSection = document.querySelector('.hero-section');
    const mapMockup = document.querySelector('.map-mockup');
    
    if (heroSection && mapMockup && window.innerWidth > 992) {
        window.addEventListener('scroll', () => {
            const scrolled = window.scrollY;
            const rate = scrolled * 0.3;
            
            if (scrolled < 600) {
                mapMockup.style.transform = `perspective(1000px) rotateY(-5deg) translateY(${-rate * 0.5}px)`;
            }
        });
    }
    
    // ========================================
    // Active Nav Link Highlight
    // ========================================
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-link');
    
    function highlightNavLink() {
        const scrollPosition = window.scrollY + navbar.offsetHeight + 100;
        
        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.offsetHeight;
            const sectionId = section.getAttribute('id');
            
            if (scrollPosition >= sectionTop && scrollPosition < sectionTop + sectionHeight) {
                navLinks.forEach(link => {
                    link.classList.remove('active');
                    if (link.getAttribute('href') === `#${sectionId}`) {
                        link.classList.add('active');
                    }
                });
            }
        });
    }
    
    window.addEventListener('scroll', highlightNavLink);
    
    // ========================================
    // Typed Effect for Hero (Optional Enhancement)
    // ========================================
    const heroTitle = document.querySelector('.hero-title .text-primary');
    
    if (heroTitle) {
        const phrases = [
            'No Guessing. No Waiting.',
            'Real-Time. Always.',
            'Smart. Reliable. Fast.'
        ];
        let phraseIndex = 0;
        let charIndex = 0;
        let isDeleting = false;
        let typingSpeed = 100;
        
        function typeEffect() {
            const currentPhrase = phrases[phraseIndex];
            
            if (isDeleting) {
                heroTitle.textContent = currentPhrase.substring(0, charIndex - 1);
                charIndex--;
                typingSpeed = 50;
            } else {
                heroTitle.textContent = currentPhrase.substring(0, charIndex + 1);
                charIndex++;
                typingSpeed = 100;
            }
            
            if (!isDeleting && charIndex === currentPhrase.length) {
                isDeleting = true;
                typingSpeed = 2000; // Pause at end
            } else if (isDeleting && charIndex === 0) {
                isDeleting = false;
                phraseIndex = (phraseIndex + 1) % phrases.length;
                typingSpeed = 500; // Pause before next phrase
            }
            
            setTimeout(typeEffect, typingSpeed);
        }
        
        // Start typing effect after a delay
        setTimeout(typeEffect, 3000);
    }
    
    // ========================================
    // Benefits Grid Animation
    // ========================================
    const benefitVisuals = document.querySelectorAll('.benefit-visual');
    
    benefitVisuals.forEach((visual, index) => {
        visual.style.animationDelay = `${index * 0.2}s`;
    });
    
    // ========================================
    // Tech Stack Hover Effect
    // ========================================
    const techItems = document.querySelectorAll('.tech-item');
    
    techItems.forEach(item => {
        item.addEventListener('mouseenter', function() {
            techItems.forEach(i => {
                if (i !== this) {
                    i.style.opacity = '0.5';
                }
            });
        });
        
        item.addEventListener('mouseleave', function() {
            techItems.forEach(i => {
                i.style.opacity = '1';
            });
        });
    });
    
    // ========================================
    // Mobile Menu Animation
    // ========================================
    const navbarToggler = document.querySelector('.navbar-toggler');
    const navbarCollapse = document.querySelector('.navbar-collapse');
    
    if (navbarToggler && navbarCollapse) {
        navbarToggler.addEventListener('click', function() {
            this.classList.toggle('active');
        });
    }
    
    // ========================================
    // Preloader (Optional)
    // ========================================
    window.addEventListener('load', function() {
        document.body.classList.add('loaded');
    });
    
    console.log('🚌 TrackMate Landing Page Initialized');
});
