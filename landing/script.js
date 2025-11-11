// Mobile menu toggle
document.addEventListener('DOMContentLoaded', () => {
  // Set copyright year
  const copyrightYear = document.getElementById('copyrightYear');
  if (copyrightYear) {
    copyrightYear.textContent = new Date().getFullYear();
  }

  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  const navLinks = document.querySelector('.nav-links');
  
  if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', () => {
      navLinks.classList.toggle('mobile-open');
      mobileMenuBtn.classList.toggle('active');
    });
  }

  // Smooth scrolling for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
        // Close mobile menu if open
        navLinks.classList.remove('mobile-open');
        mobileMenuBtn.classList.remove('active');
      }
    });
  });

  // Add scroll-based navbar shadow
  let lastScroll = 0;
  const navbar = document.querySelector('.navbar');
  
  window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;
    
    if (currentScroll > 20) {
      navbar.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
    } else {
      navbar.style.boxShadow = 'none';
    }
    
    lastScroll = currentScroll;
  });

  // Intersection Observer for fade-in animations
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -100px 0px'
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
      }
    });
  }, observerOptions);

  // Observe all feature cards, use case cards, etc.
  const animatedElements = document.querySelectorAll(
    '.feature-card, .use-case-card, .pricing-card, .faq-item'
  );
  
  animatedElements.forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(el);
  });

  // Waitlist form submission
  const waitlistForm = document.getElementById('waitlistForm');
  const emailInput = document.getElementById('emailInput');
  const formMessage = document.getElementById('formMessage');
  const submitBtn = waitlistForm.querySelector('button[type="submit"]');
  const btnText = submitBtn.querySelector('.btn-text');
  const btnLoading = submitBtn.querySelector('.btn-loading');

  waitlistForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = emailInput.value.trim();
    
    if (!email) {
      showMessage('Please enter your email address.', 'error');
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showMessage('Please enter a valid email address.', 'error');
      return;
    }

    // Show loading state
    submitBtn.disabled = true;
    btnText.style.display = 'none';
    btnLoading.style.display = 'inline-block';
    formMessage.style.display = 'none';

    console.log('[Waitlist] Attempting to submit email:', email);
    console.log('[Waitlist] Firebase DB available:', !!window.firebaseDB);
    console.log('[Waitlist] Firebase functions available:', {
      collection: !!window.firebaseCollection,
      addDoc: !!window.firebaseAddDoc,
      serverTimestamp: !!window.firebaseServerTimestamp
    });

    try {
      // Add to Firestore
      const docRef = await window.firebaseAddDoc(
        window.firebaseCollection(window.firebaseDB, 'waitlist'),
        {
          email: email,
          timestamp: window.firebaseServerTimestamp(),
          source: 'landing_page',
          interest: 'self_hosting'
        }
      );

      console.log('[Waitlist] Document added successfully! ID:', docRef.id);
      
      // Success
      showMessage('🎉 Thanks for joining! We\'ll notify you when self-hosting is available.', 'success');
      emailInput.value = '';
      
    } catch (error) {
      console.error('[Waitlist] Error adding to waitlist:', error);
      console.error('[Waitlist] Error code:', error.code);
      console.error('[Waitlist] Error message:', error.message);
      console.error('[Waitlist] Full error:', JSON.stringify(error, null, 2));
      
      // Check if it's a duplicate entry (you could add unique constraint in Firestore rules)
      if (error.code === 'already-exists') {
        showMessage('You\'re already on the waitlist!', 'error');
      } else if (error.code === 'permission-denied') {
        showMessage('Permission denied. Please check Firestore rules.', 'error');
      } else {
        showMessage(`Error: ${error.message}`, 'error');
      }
    } finally {
      // Reset button state
      submitBtn.disabled = false;
      btnText.style.display = 'inline';
      btnLoading.style.display = 'none';
    }
  });

  function showMessage(message, type) {
    formMessage.textContent = message;
    formMessage.className = `form-message ${type}`;
    formMessage.style.display = 'block';
    
    // Auto-hide success messages after 5 seconds
    if (type === 'success') {
      setTimeout(() => {
        formMessage.style.display = 'none';
      }, 5000);
    }
  }

  // PWA Install Prompt
  let deferredPrompt;
  const installBanner = document.getElementById('pwaInstallBanner');
  const installBtn = document.getElementById('pwaInstallBtn');
  const dismissInstallBtn = document.getElementById('dismissInstallBtn');

  // Listen for the beforeinstallprompt event
  window.addEventListener('beforeinstallprompt', (e) => {
    console.log('[PWA] beforeinstallprompt event fired');
    // Prevent the default mini-infobar from appearing
    e.preventDefault();
    // Stash the event so it can be triggered later
    deferredPrompt = e;
    // Show the install banner
    if (installBanner) {
      installBanner.style.display = 'flex';
    }
  });

  // Handle install button click
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) {
        console.log('[PWA] No deferred prompt available');
        return;
      }

      console.log('[PWA] Showing install prompt');
      // Show the install prompt
      deferredPrompt.prompt();

      // Wait for the user to respond to the prompt
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`[PWA] User response: ${outcome}`);

      if (outcome === 'accepted') {
        console.log('[PWA] User accepted the install prompt');
      } else {
        console.log('[PWA] User dismissed the install prompt');
      }

      // Clear the deferred prompt
      deferredPrompt = null;
      // Hide the install banner
      if (installBanner) {
        installBanner.style.display = 'none';
      }
    });
  }

  // Handle dismiss button click
  if (dismissInstallBtn) {
    dismissInstallBtn.addEventListener('click', () => {
      if (installBanner) {
        installBanner.style.display = 'none';
      }
      // Remember dismissal for this session
      sessionStorage.setItem('pwaInstallDismissed', 'true');
    });
  }

  // Check if already dismissed this session
  if (sessionStorage.getItem('pwaInstallDismissed') === 'true') {
    if (installBanner) {
      installBanner.style.display = 'none';
    }
  }

  // Listen for successful installation
  window.addEventListener('appinstalled', (evt) => {
    console.log('[PWA] App successfully installed');
    if (installBanner) {
      installBanner.style.display = 'none';
    }
  });
});
