import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

document.addEventListener('DOMContentLoaded', () => {
    // Find nav actions container
    const navActions = document.querySelector('.nav-actions');

    // Create 'My Profile' Avatar Button
    const profileBtn = document.createElement('a');
    profileBtn.href = 'profile.html';
    profileBtn.className = 'user-avatar-nav';
    profileBtn.innerHTML = '<img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix&backgroundColor=e2e8f0" alt="Avatar">';
    profileBtn.style.display = 'none';

    // Create 'Messages' button
    const messagesBtn = document.createElement('a');
    messagesBtn.href = 'chat.html';
    messagesBtn.className = 'nav-messages-btn';
    messagesBtn.innerHTML = '<i class="ri-chat-3-line"></i>';
    messagesBtn.title = 'Messages';
    messagesBtn.style.display = 'none';
    messagesBtn.style.cssText = `
        display: none;
        width: 38px; height: 38px;
        border-radius: 50%;
        background-color: rgba(15,118,110,0.08);
        color: var(--primary-color, #0f766e);
        font-size: 1.15rem;
        align-items: center;
        justify-content: center;
        text-decoration: none;
        transition: all 0.2s;
    `;

    // Create 'Log Out' button
    const logoutBtn = document.createElement('button');
    logoutBtn.className = 'nav-logout-btn';
    logoutBtn.innerHTML = '<i class="ri-logout-box-r-line"></i> Logout';
    logoutBtn.style.display = 'none';

    logoutBtn.addEventListener('click', async () => {
        try {
            await signOut(auth);
            window.location.href = 'index.html';
        } catch (error) {
            console.error('Error signing out:', error);
        }
    });

    // Optional: Add a simple container for logged-in state buttons
    const loggedInActions = document.createElement('div');
    loggedInActions.style.display = 'flex';
    loggedInActions.style.gap = '1rem';
    loggedInActions.style.alignItems = 'center';
    loggedInActions.appendChild(messagesBtn);
    loggedInActions.appendChild(logoutBtn);
    loggedInActions.appendChild(profileBtn);

    if (navActions) {
        navActions.appendChild(loggedInActions);

        const loginBtn = navActions.querySelector('a[href="login.html"]');
        const signupBtn = navActions.querySelector('a[href="signup.html"]');

        onAuthStateChanged(auth, async (user) => {
            // Treat unverified email users as logged out for the navbar UI
            const isVerifiedOrGoogle = user && (user.emailVerified || user.providerData.some(p => p.providerId === 'google.com'));
            
            if (isVerifiedOrGoogle) {
                // User is signed in
                if (loginBtn) loginBtn.style.display = 'none';
                if (signupBtn) signupBtn.style.display = 'none';
                profileBtn.style.display = 'inline-block';
                logoutBtn.style.display = 'inline-block';
                messagesBtn.style.display = 'flex';

                // Fetch avatarUrl
                try {
                    const userDoc = await getDoc(doc(db, 'users', user.uid));
                    if (userDoc.exists() && userDoc.data().avatarUrl) {
                        profileBtn.innerHTML = `<img src="${userDoc.data().avatarUrl}" alt="Avatar">`;
                    }
                } catch (e) { console.error("Could not fetch avatar:", e); }

            } else {
                // User is signed out
                if (loginBtn) loginBtn.style.display = 'inline-block';
                if (signupBtn) signupBtn.style.display = 'inline-block';
                profileBtn.style.display = 'none';
                logoutBtn.style.display = 'none';
                messagesBtn.style.display = 'none';

                // Reset to default
                profileBtn.innerHTML = '<img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix&backgroundColor=e2e8f0" alt="Avatar">';
            }

            if (document.body.dataset.waitForData !== 'true' && window.hideLoader) {
                window.hideLoader(true);
            }
        });
    }
});
