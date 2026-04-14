import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('therapist-apply-form');
    const applyCard = document.getElementById('apply-card');
    const prevBtn = document.getElementById('apply-prev');
    const nextBtn = document.getElementById('apply-next');
    const applyNav = document.getElementById('apply-nav');
    const progressSteps = document.querySelectorAll('.progress-step');
    const connectors = document.querySelectorAll('.progress-connector');
    const steps = form.querySelectorAll('.apply-step:not(.apply-success)');
    const successStep = form.querySelector('.apply-step[data-step="success"]');
    const totalSteps = steps.length;

    let currentStep = 1;
    let currentUser = null;

    // --- Auth Guard ---
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;

            // Check if user already applied
            try {
                const appDoc = await getDoc(doc(db, 'therapistApplications', user.uid));
                if (appDoc.exists()) {
                    const data = appDoc.data();
                    if (data.status === 'approved') {
                        showAlreadyApproved();
                    } else {
                        showAlreadyApplied();
                    }
                    if (window.hideLoader) window.hideLoader();
                    return;
                }

                // Pre-fill name from user profile
                const userDoc = await getDoc(doc(db, 'users', user.uid));
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    const nameField = document.getElementById('apply-fullname');
                    if (nameField && userData.fullName) {
                        nameField.value = userData.fullName;
                    }
                }
            } catch (e) {
                console.error('Error checking application:', e);
            }

            if (window.hideLoader) window.hideLoader();
        } else {
            // Not logged in — redirect to login
            alert('You need to be logged in to apply as a therapist.');
            window.location.href = 'login.html';
        }
    });

    // --- Step Navigation ---
    function goToStep(step) {
        currentStep = step;

        // Update step panels
        steps.forEach(s => {
            s.classList.remove('active');
            if (parseInt(s.dataset.step) === step) {
                s.classList.add('active');
            }
        });

        // Update progress indicators
        progressSteps.forEach((ps, idx) => {
            const stepNum = idx + 1;
            ps.classList.remove('active', 'completed');
            if (stepNum === step) {
                ps.classList.add('active');
            } else if (stepNum < step) {
                ps.classList.add('completed');
            }
        });

        // Update connectors
        connectors.forEach((c, idx) => {
            c.classList.toggle('active', idx < step - 1);
        });

        // Update buttons
        prevBtn.disabled = step === 1;
        prevBtn.style.visibility = step === 1 ? 'hidden' : 'visible';

        if (step === totalSteps) {
            nextBtn.innerHTML = '<i class="ri-check-line"></i> Submit Application';
            populateReview();
        } else {
            nextBtn.innerHTML = 'Next <i class="ri-arrow-right-line"></i>';
        }

        // Scroll to top of card
        applyCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    nextBtn.addEventListener('click', () => {
        if (currentStep < totalSteps) {
            if (validateStep(currentStep)) {
                goToStep(currentStep + 1);
            }
        } else {
            // Submit
            submitApplication();
        }
    });

    prevBtn.addEventListener('click', () => {
        if (currentStep > 1) {
            goToStep(currentStep - 1);
        }
    });

    // --- Validation ---
    function validateStep(step) {
        let valid = true;
        const activeStep = form.querySelector(`.apply-step[data-step="${step}"]`);

        // Clear previous errors
        activeStep.querySelectorAll('.form-group.has-error').forEach(g => {
            g.classList.remove('has-error');
        });

        if (step === 1) {
            const name = document.getElementById('apply-fullname');
            const phone = document.getElementById('apply-phone');
            const bio = document.getElementById('apply-bio');
            const city = document.getElementById('apply-city');
            const country = document.getElementById('apply-country');

            if (!name.value.trim()) { markError(name); valid = false; }
            if (!phone.value.trim()) { markError(phone); valid = false; }
            if (!bio.value.trim() || bio.value.trim().length < 50) { markError(bio); valid = false; }
            if (!city.value.trim()) { markError(city); valid = false; }
            if (!country.value.trim()) { markError(country); valid = false; }
        }

        if (step === 2) {
            const licenseType = document.getElementById('apply-license-type');
            const licenseNumber = document.getElementById('apply-license-number');
            const issuingBody = document.getElementById('apply-issuing-body');
            const years = document.getElementById('apply-years');
            const education = document.getElementById('apply-education');

            if (!licenseType.value) { markError(licenseType); valid = false; }
            if (!licenseNumber.value.trim()) { markError(licenseNumber); valid = false; }
            if (!issuingBody.value.trim()) { markError(issuingBody); valid = false; }
            if (!years.value || years.value < 0) { markError(years); valid = false; }
            if (!education.value.trim()) { markError(education); valid = false; }
        }

        if (step === 3) {
            const checked = form.querySelectorAll('input[name="specialties"]:checked');
            if (checked.length === 0) {
                alert('Please select at least one specialty.');
                valid = false;
            }
        }

        if (step === 4) {
            const agreeBox = document.getElementById('apply-agree');
            if (!agreeBox.checked) {
                alert('You must agree to the terms before submitting.');
                valid = false;
            }
        }

        if (!valid) {
            // Shake the button for feedback
            nextBtn.classList.add('shake');
            setTimeout(() => nextBtn.classList.remove('shake'), 500);
        }

        return valid;
    }

    function markError(input) {
        const group = input.closest('.form-group');
        if (group) group.classList.add('has-error');
        input.focus();
    }

    // --- Populate Review --- 
    function populateReview() {
        const summary = document.getElementById('review-summary');
        const specialties = [...form.querySelectorAll('input[name="specialties"]:checked')].map(c => c.value);
        const approach = document.getElementById('apply-approach');

        summary.innerHTML = `
            <div class="review-group">
                <h4>Personal Information</h4>
                <div class="review-row">
                    <span class="review-label">Full Name</span>
                    <span class="review-value">${document.getElementById('apply-fullname').value}</span>
                </div>
                <div class="review-row">
                    <span class="review-label">Phone</span>
                    <span class="review-value">${document.getElementById('apply-phone').value}</span>
                </div>
                <div class="review-row">
                    <span class="review-label">Location</span>
                    <span class="review-value">${document.getElementById('apply-city').value}, ${document.getElementById('apply-country').value}</span>
                </div>
            </div>
            <div class="review-group">
                <h4>Credentials</h4>
                <div class="review-row">
                    <span class="review-label">License Type</span>
                    <span class="review-value">${document.getElementById('apply-license-type').value}</span>
                </div>
                <div class="review-row">
                    <span class="review-label">License #</span>
                    <span class="review-value">${document.getElementById('apply-license-number').value}</span>
                </div>
                <div class="review-row">
                    <span class="review-label">Issuing Authority</span>
                    <span class="review-value">${document.getElementById('apply-issuing-body').value}</span>
                </div>
                <div class="review-row">
                    <span class="review-label">Experience</span>
                    <span class="review-value">${document.getElementById('apply-years').value} years</span>
                </div>
            </div>
            <div class="review-group">
                <h4>Specialties</h4>
                <div class="review-tags">${specialties.map(s => `<span class="tag">${s}</span>`).join('')}</div>
                ${approach.value ? `<div class="review-row" style="margin-top:0.75rem;"><span class="review-label">Approach</span><span class="review-value">${approach.value}</span></div>` : ''}
            </div>
        `;
    }

    // --- Submit Application ---
    async function submitApplication() {
        if (!validateStep(4)) return;
        if (!currentUser) {
            alert('You must be logged in.');
            return;
        }

        nextBtn.disabled = true;
        nextBtn.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> Submitting...';

        const specialties = [...form.querySelectorAll('input[name="specialties"]:checked')].map(c => c.value);

        const applicationData = {
            uid: currentUser.uid,
            email: currentUser.email,
            fullName: document.getElementById('apply-fullname').value.trim(),
            phone: document.getElementById('apply-phone').value.trim(),
            bio: document.getElementById('apply-bio').value.trim(),
            city: document.getElementById('apply-city').value.trim(),
            country: document.getElementById('apply-country').value.trim(),
            licenseType: document.getElementById('apply-license-type').value,
            licenseNumber: document.getElementById('apply-license-number').value.trim(),
            issuingBody: document.getElementById('apply-issuing-body').value.trim(),
            yearsExperience: parseInt(document.getElementById('apply-years').value),
            education: document.getElementById('apply-education').value.trim(),
            specialties: specialties,
            therapeuticApproach: document.getElementById('apply-approach').value || '',
            status: 'pending', // pending | approved | rejected
            appliedAt: serverTimestamp(),
        };

        try {
            // Save application to Firestore
            await setDoc(doc(db, 'therapistApplications', currentUser.uid), applicationData);

            // Also update user doc with therapist role pending
            const { updateDoc } = await import('firebase/firestore');
            await updateDoc(doc(db, 'users', currentUser.uid), {
                therapistStatus: 'pending',
                therapistAppliedAt: serverTimestamp()
            });

            // Show success
            steps.forEach(s => s.classList.remove('active'));
            successStep.style.display = 'block';
            successStep.classList.add('active');
            applyNav.style.display = 'none';
            document.querySelector('.apply-progress').style.display = 'none';

        } catch (error) {
            console.error('Error submitting application:', error);
            alert('Failed to submit application. Please try again.');
            nextBtn.disabled = false;
            nextBtn.innerHTML = '<i class="ri-check-line"></i> Submit Application';
        }
    }

    // --- Already Applied / Approved States ---
    function showAlreadyApplied() {
        applyCard.innerHTML = `
            <div style="text-align:center; padding: 3rem 1rem;">
                <div class="step-icon" style="margin: 0 auto 1.5rem; background: linear-gradient(135deg, #f59e0b, #fbbf24);">
                    <i class="ri-time-line" style="color:#78350f;"></i>
                </div>
                <h2 style="margin-bottom: 1rem;">Application Under Review</h2>
                <p style="color:var(--text-muted); max-width:450px; margin:0 auto 2rem; line-height:1.7;">
                    Your therapist verification application has been submitted and is currently being reviewed. 
                    We'll update your profile once it's approved.
                </p>
                <a href="profile.html" class="btn btn-primary btn-lg"><i class="ri-user-line"></i> View Profile</a>
            </div>
        `;
    }

    function showAlreadyApproved() {
        applyCard.innerHTML = `
            <div style="text-align:center; padding: 3rem 1rem;">
                <div class="success-checkmark" style="margin: 0 auto 1.5rem;">
                    <i class="ri-verified-badge-fill"></i>
                </div>
                <h2 style="margin-bottom: 1rem;">You're Already Verified! 🎉</h2>
                <p style="color:var(--text-muted); max-width:450px; margin:0 auto 2rem; line-height:1.7;">
                    Congratulations! Your therapist credentials have been verified. 
                    Your profile displays a verified badge.
                </p>
                <a href="profile.html" class="btn btn-primary btn-lg"><i class="ri-user-line"></i> View Profile</a>
            </div>
        `;
    }

    // Initialize
    goToStep(1);
});
