import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
    collection, getDocs, doc, getDoc, updateDoc, deleteDoc,
    query, orderBy, serverTimestamp, onSnapshot
} from 'firebase/firestore';

// =============================================
//  ADMIN CONFIGURATION
//  Add admin email addresses here
// =============================================
const ADMIN_EMAILS = [
    'admin@mindcare.com',
    // Add your own email below to grant yourself admin access:
    // 'your-email@gmail.com',
];

// =============================================
//  DOM References
// =============================================
const loader = document.getElementById('admin-loader');
const accessDenied = document.getElementById('access-denied');
const adminShell = document.getElementById('admin-shell');
const sidebar = document.getElementById('admin-sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');
const topbarTitle = document.getElementById('topbar-title');
const logoutBtn = document.getElementById('admin-logout-btn');
const pendingBadge = document.getElementById('pending-count-badge');
const toast = document.getElementById('admin-toast');
const toastMsg = document.getElementById('toast-message');

// Detail modal
const modalOverlay = document.getElementById('app-detail-modal');
const modalBody = document.getElementById('modal-body');
const modalFooter = document.getElementById('modal-footer');
const modalCloseBtn = document.getElementById('modal-close-btn');

// Data stores
let allApplications = [];
let allUsers = [];
let allFeedback = [];
let currentFilter = 'all';
let currentUserFilter = 'all';

// =============================================
//  INIT — Auth Guard
// =============================================
function hideLoader() {
    if (loader) {
        loader.classList.add('fade-out');
        setTimeout(() => { loader.style.display = 'none'; }, 400);
    }
}

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        // Not logged in
        hideLoader();
        accessDenied.style.display = 'flex';
        return;
    }

    // Check if user email is in admin list
    const email = user.email?.toLowerCase();
    const isAdmin = ADMIN_EMAILS.some(e => e.toLowerCase() === email);

    // Also check Firestore for admin role
    let isFirestoreAdmin = false;
    try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists() && userDoc.data().role === 'admin') {
            isFirestoreAdmin = true;
        }
    } catch (e) { /* ignore */ }

    if (!isAdmin && !isFirestoreAdmin) {
        hideLoader();
        accessDenied.style.display = 'flex';
        return;
    }

    // ✅ Admin authorized
    accessDenied.style.display = 'none';
    adminShell.style.display = 'flex';

    // Populate admin info
    document.getElementById('admin-user-name').textContent = user.displayName || 'Admin';
    document.getElementById('admin-user-email').textContent = user.email;

    // Try to fetch admin's avatar
    try {
        const adminDoc = await getDoc(doc(db, 'users', user.uid));
        if (adminDoc.exists() && adminDoc.data().avatarUrl) {
            document.getElementById('admin-avatar').src = adminDoc.data().avatarUrl;
        }
    } catch (e) { /* ignore */ }

    // Load data
    await Promise.all([loadApplications(), loadUsers(), loadFeedback()]);
    updateStats();
    renderRecentApps();
    renderApplicationsTable();
    renderUsersTable();
    renderFeedbackTable();

    hideLoader();
});

// =============================================
//  LOGOUT
// =============================================
logoutBtn.addEventListener('click', async () => {
    await signOut(auth);
    window.location.href = 'index.html';
});

// =============================================
//  SIDEBAR NAVIGATION
// =============================================
const sidebarLinks = document.querySelectorAll('.sidebar-link[data-tab]');
const tabs = document.querySelectorAll('.admin-tab');

const tabTitles = {
    dashboard: 'Dashboard',
    applications: 'Therapist Applications',
    users: 'User Management',
    feedback: 'Account Deletion Feedback'
};

sidebarLinks.forEach(link => {
    link.addEventListener('click', () => {
        const tabName = link.dataset.tab;

        // Update sidebar
        sidebarLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');

        // Update tabs
        tabs.forEach(t => t.classList.remove('active'));
        document.getElementById(`tab-${tabName}`).classList.add('active');

        // Update title
        topbarTitle.textContent = tabTitles[tabName] || tabName;

        // Close mobile sidebar
        sidebar.classList.remove('open');
        document.querySelector('.sidebar-overlay')?.classList.remove('active');
    });
});

// View All button on dashboard
document.getElementById('view-all-apps-btn')?.addEventListener('click', () => {
    document.querySelector('.sidebar-link[data-tab="applications"]').click();
});

// =============================================
//  MOBILE SIDEBAR TOGGLE
// =============================================
// Create overlay element
const sidebarOverlay = document.createElement('div');
sidebarOverlay.className = 'sidebar-overlay';
document.body.appendChild(sidebarOverlay);

sidebarToggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    sidebarOverlay.classList.toggle('active');
});

sidebarOverlay.addEventListener('click', () => {
    sidebar.classList.remove('open');
    sidebarOverlay.classList.remove('active');
});

// =============================================
//  DATA LOADING
// =============================================
function loadApplications() {
    return new Promise((resolve) => {
        const q = query(collection(db, 'therapistApplications'), orderBy('appliedAt', 'desc'));
        let initial = true;
        onSnapshot(q, (snapshot) => {
            allApplications = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            if (!initial) {
                updateStats();
                renderRecentApps();
                renderApplicationsTable(currentFilter, document.getElementById('app-search-input')?.value || '');
            }
            if (initial) { initial = false; resolve(); }
        }, (e) => {
            console.error('Error loading applications:', e);
            // Fallback (if index is missing)
            onSnapshot(collection(db, 'therapistApplications'), (snap) => {
                allApplications = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                if (!initial) {
                    updateStats();
                    renderRecentApps();
                    renderApplicationsTable(currentFilter, document.getElementById('app-search-input')?.value || '');
                }
                if (initial) { initial = false; resolve(); }
            }, (err) => {
                console.error('Error loading applications (fallback):', err);
                allApplications = [];
                if (initial) { initial = false; resolve(); }
            });
        });
    });
}

function loadUsers() {
    return new Promise((resolve) => {
        let initial = true;
        onSnapshot(collection(db, 'users'), (snapshot) => {
            allUsers = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            if (!initial) {
                updateStats();
                renderUsersTable(currentUserFilter, document.getElementById('user-search-input')?.value || '');
            }
            if (initial) { initial = false; resolve(); }
        }, (e) => {
            console.error('Error loading users:', e);
            allUsers = [];
            if (initial) { initial = false; resolve(); }
        });
    });
}

function loadFeedback() {
    return new Promise((resolve) => {
        let initial = true;
        onSnapshot(collection(db, 'account_deletion_feedback'), (snapshot) => {
            allFeedback = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            allFeedback.sort((a, b) => new Date(b.deletedAt || 0) - new Date(a.deletedAt || 0));
            if (!initial) renderFeedbackTable();
            if (initial) { initial = false; resolve(); }
        }, (e) => {
            console.error('Error loading feedback:', e);
            allFeedback = [];
            if (initial) { initial = false; resolve(); }
        });
    });
}

// =============================================
//  STATS
// =============================================
function updateStats() {
    const pending = allApplications.filter(a => a.status === 'pending').length;
    const approved = allApplications.filter(a => a.status === 'approved').length;
    const rejected = allApplications.filter(a => a.status === 'rejected').length;

    document.getElementById('stat-total-users').textContent = allUsers.length;
    document.getElementById('stat-pending').textContent = pending;
    document.getElementById('stat-approved').textContent = approved;
    document.getElementById('stat-rejected').textContent = rejected;

    // Pending badge in sidebar
    if (pending > 0) {
        pendingBadge.style.display = 'inline-block';
        pendingBadge.textContent = pending;
    } else {
        pendingBadge.style.display = 'none';
    }
}

// =============================================
//  RECENT APPS (Dashboard)
// =============================================
function renderRecentApps() {
    const container = document.getElementById('recent-apps-list');
    const pending = allApplications.filter(a => a.status === 'pending').slice(0, 5);

    if (pending.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="ri-inbox-line"></i>
                <p>No pending applications</p>
            </div>`;
        return;
    }

    container.innerHTML = pending.map(app => {
        const initials = getInitials(app.fullName);
        const timeAgo = formatTimeAgo(app.appliedAt);
        return `
            <div class="recent-app-item" data-id="${app.id}" style="cursor:pointer;">
                <div class="recent-app-avatar">${initials}</div>
                <div class="recent-app-info">
                    <div class="recent-app-name">${escapeHtml(app.fullName)}</div>
                    <div class="recent-app-meta">${escapeHtml(app.licenseType)} · ${timeAgo}</div>
                </div>
                <span class="status-badge status-badge--pending"><i class="ri-time-line"></i> Pending</span>
            </div>`;
    }).join('');

    // Click to open detail
    container.querySelectorAll('.recent-app-item').forEach(item => {
        item.addEventListener('click', () => {
            const app = allApplications.find(a => a.id === item.dataset.id);
            if (app) openDetailModal(app);
        });
    });
}

// =============================================
//  APPLICATIONS TABLE
// =============================================
function renderApplicationsTable(filter = currentFilter, searchTerm = '') {
    currentFilter = filter;
    const tbody = document.getElementById('applications-tbody');

    let filtered = allApplications;

    if (filter !== 'all') {
        filtered = filtered.filter(a => a.status === filter);
    }

    if (searchTerm) {
        const s = searchTerm.toLowerCase();
        filtered = filtered.filter(a =>
            (a.fullName || '').toLowerCase().includes(s) ||
            (a.email || '').toLowerCase().includes(s)
        );
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="6" class="table-loading">
                <i class="ri-inbox-line" style="animation:none;"></i> No applications found
            </td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(app => {
        const statusClass = `status-badge--${app.status}`;
        const statusIcon = app.status === 'pending' ? 'ri-time-line'
            : app.status === 'approved' ? 'ri-check-line'
                : 'ri-close-line';
        const timeAgo = formatTimeAgo(app.appliedAt);
        const initials = getInitials(app.fullName);

        return `
            <tr>
                <td>
                    <div class="cell-user">
                        <div class="recent-app-avatar" style="width:36px;height:36px;font-size:0.8rem;">${initials}</div>
                        <div class="cell-user-info">
                            <span class="cell-name">${escapeHtml(app.fullName)}</span>
                            <span class="cell-email">${escapeHtml(app.email || '')}</span>
                        </div>
                    </div>
                </td>
                <td>${escapeHtml(app.licenseType || 'N/A')}</td>
                <td>${app.yearsExperience || 0} yrs</td>
                <td><span class="status-badge ${statusClass}"><i class="${statusIcon}"></i> ${capitalize(app.status)}</span></td>
                <td>${timeAgo}</td>
                <td>
                    <div class="cell-actions">
                        <button class="btn btn-ghost" title="View Details" data-action="view" data-id="${app.id}">
                            <i class="ri-eye-line"></i>
                        </button>
                        ${app.status === 'pending' ? `
                            <button class="btn btn-approve btn-sm" title="Approve" data-action="approve" data-id="${app.id}">
                                <i class="ri-check-line"></i>
                            </button>
                            <button class="btn btn-reject btn-sm" title="Reject" data-action="reject" data-id="${app.id}">
                                <i class="ri-close-line"></i>
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>`;
    }).join('');

    // Attach action handlers
    tbody.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const action = btn.dataset.action;
            const id = btn.dataset.id;
            const app = allApplications.find(a => a.id === id);

            if (action === 'view' && app) openDetailModal(app);
            if (action === 'approve' && app) await handleStatusChange(app, 'approved');
            if (action === 'reject' && app) await handleStatusChange(app, 'rejected');
        });
    });
}

// Application filter chips
document.querySelectorAll('#tab-applications .filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
        document.querySelectorAll('#tab-applications .filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        renderApplicationsTable(chip.dataset.filter, document.getElementById('app-search-input').value);
    });
});

// Application search
document.getElementById('app-search-input')?.addEventListener('input', (e) => {
    renderApplicationsTable(currentFilter, e.target.value);
});

// =============================================
//  USERS TABLE
// =============================================
function renderUsersTable(filter = currentUserFilter, searchTerm = '') {
    currentUserFilter = filter;
    const tbody = document.getElementById('users-tbody');

    let filtered = allUsers;

    if (filter === 'therapist') {
        filtered = filtered.filter(u => u.therapistStatus === 'approved');
    } else if (filter === 'regular') {
        filtered = filtered.filter(u => !u.therapistStatus || u.therapistStatus === 'none');
    }

    if (searchTerm) {
        const s = searchTerm.toLowerCase();
        filtered = filtered.filter(u =>
            (u.fullName || '').toLowerCase().includes(s) ||
            (u.email || '').toLowerCase().includes(s)
        );
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="6" class="table-loading">
                <i class="ri-inbox-line" style="animation:none;"></i> No users found
            </td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(user => {
        const name = user.fullName || 'Unknown';
        const email = user.email || 'N/A';
        const occupation = user.occupation || '—';
        const isTherapist = user.therapistStatus === 'approved';
        const isPending = user.therapistStatus === 'pending';
        const joined = formatTimeAgo(user.createdAt);
        const avatarUrl = user.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}&backgroundColor=e2e8f0`;

        let roleBadge = '';
        if (isTherapist) {
            roleBadge = '<span class="status-badge status-badge--therapist"><i class="ri-verified-badge-fill"></i> Therapist</span>';
        } else if (isPending) {
            roleBadge = '<span class="status-badge status-badge--pending"><i class="ri-time-line"></i> Pending</span>';
        } else {
            roleBadge = '<span style="color:var(--text-muted); font-size:0.82rem;">User</span>';
        }

        return `
            <tr>
                <td>
                    <div class="cell-user">
                        <img src="${avatarUrl}" class="cell-avatar" alt="">
                        <span class="cell-name">${escapeHtml(name)}</span>
                    </div>
                </td>
                <td><span class="cell-email">${escapeHtml(email)}</span></td>
                <td>${escapeHtml(occupation)}</td>
                <td>${roleBadge}</td>
                <td>${joined}</td>
                <td>
                    <div class="cell-actions">
                        <button class="btn btn-reject btn-sm" title="Delete User" data-action="delete" data-id="${user.id}">
                            <i class="ri-delete-bin-line"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
    }).join('');
    
    // Attach action handlers for users table
    tbody.querySelectorAll('[data-action="delete"]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            const user = allUsers.find(u => u.id === id);
            if (user && confirm(`Are you sure you want to delete user ${user.fullName || user.email}? This will remove their database record permanently.`)) {
                try {
                    await deleteDoc(doc(db, 'users', id));
                    // Try to clean up application doc
                    try {
                        await deleteDoc(doc(db, 'therapistApplications', id));
                    } catch (err) { /* ignore */ }
                    
                    // Update local state
                    allUsers = allUsers.filter(u => u.id !== id);
                    updateStats();
                    renderUsersTable(currentUserFilter, document.getElementById('user-search-input')?.value || '');
                    showToast('User deleted successfully');
                } catch (error) {
                    console.error('Error deleting user:', error);
                    showToast('Failed to delete user. See console.');
                }
            }
        });
    });
}

// User filter chips
document.querySelectorAll('#tab-users .filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
        document.querySelectorAll('#tab-users .filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        renderUsersTable(chip.dataset.filter, document.getElementById('user-search-input').value);
    });
});

// User search
document.getElementById('user-search-input')?.addEventListener('input', (e) => {
    renderUsersTable(currentUserFilter, e.target.value);
});

// =============================================
//  FEEDBACK TABLE
// =============================================
function renderFeedbackTable() {
    const tbody = document.getElementById('feedback-tbody');
    if (!tbody) return;
    
    if (allFeedback.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="3" class="table-loading">
                <i class="ri-inbox-line" style="animation:none;"></i> No feedback found
            </td></tr>`;
        return;
    }

    tbody.innerHTML = allFeedback.map(fb => {
        const email = fb.email || 'Unknown';
        const text = fb.feedback ? escapeHtml(fb.feedback) : '<span style="color:var(--text-muted);font-style:italic;">No feedback provided</span>';
        let date = 'Unknown';
        if (fb.deletedAt) {
            const d = new Date(fb.deletedAt);
            date = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        }

        return `
            <tr>
                <td><span class="cell-email">${escapeHtml(email)}</span></td>
                <td style="white-space: normal; line-height: 1.5; color: var(--text-color);">${text}</td>
                <td><span style="color:var(--text-muted);font-size:0.85rem;">${date}</span></td>
            </tr>`;
    }).join('');
}

// =============================================
//  APPLICATION DETAIL MODAL
// =============================================
function openDetailModal(app) {
    const specialtiesTags = (app.specialties || [])
        .map(s => `<span class="detail-tag">${escapeHtml(s)}</span>`)
        .join('');

    modalBody.innerHTML = `
        <div class="detail-group">
            <div class="detail-group-title">Personal Information</div>
            <div class="detail-row">
                <span class="detail-label">Full Name</span>
                <span class="detail-val">${escapeHtml(app.fullName)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Email</span>
                <span class="detail-val">${escapeHtml(app.email || 'N/A')}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Phone</span>
                <span class="detail-val">${escapeHtml(app.phone || 'N/A')}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Location</span>
                <span class="detail-val">${escapeHtml(app.city || '')}${app.city && app.country ? ', ' : ''}${escapeHtml(app.country || '')}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Bio</span>
            </div>
            <div class="detail-bio">${escapeHtml(app.bio || 'No bio provided.')}</div>
        </div>

        <div class="detail-group">
            <div class="detail-group-title">Credentials</div>
            <div class="detail-row">
                <span class="detail-label">License Type</span>
                <span class="detail-val">${escapeHtml(app.licenseType || 'N/A')}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">License Number</span>
                <span class="detail-val">${escapeHtml(app.licenseNumber || 'N/A')}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Issuing Authority</span>
                <span class="detail-val">${escapeHtml(app.issuingBody || 'N/A')}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Years of Experience</span>
                <span class="detail-val">${app.yearsExperience || 0} years</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Education</span>
            </div>
            <div class="detail-bio">${escapeHtml(app.education || 'Not provided.')}</div>
        </div>

        <div class="detail-group">
            <div class="detail-group-title">Specialties & Approach</div>
            <div class="detail-row">
                <span class="detail-label">Specialties</span>
                <div class="detail-tags">${specialtiesTags || '<span style="color:var(--text-muted)">None</span>'}</div>
            </div>
            ${app.therapeuticApproach ? `
                <div class="detail-row">
                    <span class="detail-label">Approach</span>
                    <span class="detail-val">${escapeHtml(app.therapeuticApproach)}</span>
                </div>` : ''}
        </div>

        <div class="detail-group">
            <div class="detail-group-title">Status</div>
            <div class="detail-row">
                <span class="detail-label">Current Status</span>
                <span class="status-badge status-badge--${app.status}">
                    <i class="${app.status === 'pending' ? 'ri-time-line' : app.status === 'approved' ? 'ri-check-line' : 'ri-close-line'}"></i>
                    ${capitalize(app.status)}
                </span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Applied</span>
                <span class="detail-val">${formatTimeAgo(app.appliedAt)}</span>
            </div>
        </div>
    `;

    // Footer buttons
    if (app.status === 'pending') {
        modalFooter.innerHTML = `
            <button class="btn btn-outline" id="modal-reject">
                <i class="ri-close-line"></i> Reject
            </button>
            <button class="btn btn-approve" id="modal-approve">
                <i class="ri-check-line"></i> Approve
            </button>
        `;

        document.getElementById('modal-approve').addEventListener('click', async () => {
            await handleStatusChange(app, 'approved');
            closeModal();
        });

        document.getElementById('modal-reject').addEventListener('click', async () => {
            await handleStatusChange(app, 'rejected');
            closeModal();
        });
    } else {
        modalFooter.innerHTML = `
            <button class="btn btn-outline" id="modal-close-footer">Close</button>
        `;
        document.getElementById('modal-close-footer').addEventListener('click', closeModal);
    }

    modalOverlay.classList.add('active');
}

function closeModal() {
    modalOverlay.classList.remove('active');
}

modalCloseBtn.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
});

// =============================================
//  STATUS CHANGE (Approve / Reject)
// =============================================
async function handleStatusChange(app, newStatus) {
    try {
        // Update application doc
        await updateDoc(doc(db, 'therapistApplications', app.id), {
            status: newStatus,
            reviewedAt: serverTimestamp()
        });

        // Update user doc
        await updateDoc(doc(db, 'users', app.uid || app.id), {
            therapistStatus: newStatus,
            therapistReviewedAt: serverTimestamp()
        });

        // Update local data
        app.status = newStatus;
        const userIdx = allUsers.findIndex(u => u.id === (app.uid || app.id));
        if (userIdx !== -1) {
            allUsers[userIdx].therapistStatus = newStatus;
        }

        // Re-render everything
        updateStats();
        renderRecentApps();
        renderApplicationsTable(currentFilter, document.getElementById('app-search-input')?.value || '');
        renderUsersTable(currentUserFilter, document.getElementById('user-search-input')?.value || '');

        showToast(`Application ${newStatus} successfully!`);

    } catch (error) {
        console.error(`Error updating status to ${newStatus}:`, error);
        showToast(`Failed to update status. Check console.`);
    }
}

// =============================================
//  TOAST
// =============================================
function showToast(message) {
    toastMsg.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// =============================================
//  UTILITIES
// =============================================
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function getInitials(name) {
    if (!name) return '?';
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function formatTimeAgo(timestamp) {
    if (!timestamp) return 'Unknown';

    let date;
    if (timestamp.toDate) {
        date = timestamp.toDate();
    } else if (timestamp.seconds) {
        date = new Date(timestamp.seconds * 1000);
    } else {
        date = new Date(timestamp);
    }

    const now = new Date();
    const diff = Math.floor((now - date) / 1000);

    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
