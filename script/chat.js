import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
    collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
    query, where, orderBy, onSnapshot, serverTimestamp, limit, writeBatch
} from 'firebase/firestore';

// =============================================
//  DOM REFERENCES
// =============================================
const chatApp = document.getElementById('chat-app');
const convList = document.getElementById('conversation-list');
const convLoading = document.getElementById('conv-loading');
const convSearch = document.getElementById('conv-search');
const chatEmpty = document.getElementById('chat-empty');
const chatActive = document.getElementById('chat-active');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');
const chatHeaderAvatar = document.getElementById('chat-header-avatar');
const chatHeaderName = document.getElementById('chat-header-name');
const chatHeaderMeta = document.getElementById('chat-header-meta');
const chatBackBtn = document.getElementById('chat-back-btn');
const chatInfoToggle = document.getElementById('chat-info-toggle');
const chatInfoPanel = document.getElementById('chat-info-panel');
const infoPanelBody = document.getElementById('info-panel-body');
const infoPanelClose = document.getElementById('info-panel-close');
const sidebarAvatar = document.getElementById('sidebar-avatar');
const sidebarName = document.getElementById('sidebar-name');
const chatSidebar = document.getElementById('chat-sidebar');
const sidebarOverlay = document.getElementById('chat-sidebar-overlay');
const chatDeleteBtn = document.getElementById('chat-delete-btn');
const confirmModal = document.getElementById('confirm-modal');
const confirmTitle = document.getElementById('confirm-title');
const confirmText = document.getElementById('confirm-text');
const confirmCancel = document.getElementById('confirm-cancel');
const confirmOk = document.getElementById('confirm-ok');
const msgContextMenu = document.getElementById('msg-context-menu');
const ctxDeleteMsg = document.getElementById('ctx-delete-msg');
const ctxReplyMsg = document.getElementById('ctx-reply-msg');
const replyPreview = document.getElementById('reply-preview');
const replyPreviewName = document.getElementById('reply-preview-name');
const replyPreviewText = document.getElementById('reply-preview-text');
const replyPreviewClose = document.getElementById('reply-preview-close');

let activeReplyData = null;

let currentUser = null;
let currentUserData = null;
let currentConvId = null;
let currentTherapistUid = null;
let messageUnsub = null; // Firestore listener cleanup
let conversations = [];
let isTherapist = false;
const chatRateBtn = document.getElementById('chat-rate-btn');

// =============================================
//  AUTH GUARD
// =============================================
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'login.html';
        return;
    }

    currentUser = user;

    // Load user data
    try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
            currentUserData = userDoc.data();
            sidebarName.textContent = currentUserData.fullName || user.displayName || 'Me';
            if (currentUserData.avatarUrl) {
                sidebarAvatar.src = currentUserData.avatarUrl;
            }
            isTherapist = currentUserData.therapistStatus === 'approved';
        }
    } catch (e) {
        console.error('Error loading user:', e);
    }

    chatApp.style.display = 'flex';

    // Load conversations
    await loadConversations();

    // Check URL params for auto-opening a therapist chat
    const params = new URLSearchParams(window.location.search);
    const therapistId = params.get('therapist');
    const therapistName = params.get('name');
    if (therapistId && therapistId !== user.uid) {
        await openOrCreateConversation(therapistId, therapistName || 'Therapist');
    }

    if (window.hideLoader) window.hideLoader();
});

// =============================================
//  LOAD CONVERSATIONS
// =============================================
async function loadConversations() {
    convLoading.style.display = 'flex';

    try {
        const q = query(
            collection(db, 'conversations'),
            where('participants', 'array-contains', currentUser.uid),
            orderBy('lastMessageAt', 'desc')
        );

        // Real-time listener for conversation list
        onSnapshot(q, (snapshot) => {
            conversations = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            renderConversationList();
            convLoading.style.display = 'none';
        }, (error) => {
            console.error('Conversation listener error:', error);
            // Fallback: try without ordering (index might not be built)
            loadConversationsFallback();
        });
    } catch (e) {
        console.error('Error loading conversations:', e);
        loadConversationsFallback();
    }
}

async function loadConversationsFallback() {
    try {
        const q = query(
            collection(db, 'conversations'),
            where('participants', 'array-contains', currentUser.uid)
        );
        const snapshot = await getDocs(q);
        conversations = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        // Sort locally
        conversations.sort((a, b) => {
            const aTime = a.lastMessageAt?.seconds || 0;
            const bTime = b.lastMessageAt?.seconds || 0;
            return bTime - aTime;
        });
        renderConversationList();
    } catch (e) {
        console.error('Fallback error:', e);
        conversations = [];
        renderConversationList();
    }
    convLoading.style.display = 'none';
}

// =============================================
//  RENDER CONVERSATION LIST
// =============================================
function renderConversationList(searchTerm = '') {
    // Clear existing items (keep loading)
    convList.querySelectorAll('.conv-item, .conv-empty').forEach(el => el.remove());

    let filtered = conversations;
    if (searchTerm) {
        const s = searchTerm.toLowerCase();
        filtered = filtered.filter(c => {
            const otherUid = getOtherParticipant(c);
            const name = (c.participantNames && c.participantNames[otherUid]) || '';
            return name.toLowerCase().includes(s);
        });
    }

    if (filtered.length === 0 && convLoading.style.display === 'none') {
        convList.innerHTML += `
            <div class="conv-empty">
                <i class="ri-chat-off-line"></i>
                <p>${searchTerm ? 'No matching conversations' : 'No conversations yet'}</p>
                <p style="font-size:0.8rem; margin-top:0.5rem;">
                    <a href="therapists.html" style="color:var(--primary-color); font-weight:600;">Browse therapists</a> to start messaging
                </p>
            </div>`;
        return;
    }

    filtered.forEach(conv => {
        const otherUid = getOtherParticipant(conv);
        const otherName = (conv.participantNames && conv.participantNames[otherUid]) || 'Unknown';
        const otherAvatar = (conv.participantAvatars && conv.participantAvatars[otherUid])
            || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(otherName)}&backgroundColor=e2e8f0`;
        const lastMsg = conv.lastMessage || 'Start a conversation';
        const timeStr = formatTimeShort(conv.lastMessageAt);

        const div = document.createElement('div');
        div.className = `conv-item${conv.id === currentConvId ? ' active' : ''}`;
        div.dataset.convId = conv.id;
        div.innerHTML = `
            <img class="conv-avatar" src="${otherAvatar}" alt="${escapeHtml(otherName)}">
            <div class="conv-details">
                <div class="conv-name">${escapeHtml(otherName)}</div>
                <div class="conv-last-msg">${escapeHtml(lastMsg)}</div>
            </div>
            <span class="conv-time">${timeStr}</span>
        `;
        div.addEventListener('click', () => openConversation(conv));
        attachConvContextMenu(div, conv);
        convList.appendChild(div);
    });
}

// Search
convSearch?.addEventListener('input', (e) => {
    renderConversationList(e.target.value);
});

// =============================================
//  OPEN OR CREATE CONVERSATION
// =============================================
async function openOrCreateConversation(therapistUid, therapistName) {
    // 1. Check local array first (fast path)
    const localExisting = conversations.find(c => c.participants.includes(therapistUid));
    if (localExisting) {
        openConversation(localExisting);
        return;
    }

    // 2. Check Firestore directly (prevents duplicates from race conditions)
    try {
        const q = query(
            collection(db, 'conversations'),
            where('participants', 'array-contains', currentUser.uid)
        );
        const snapshot = await getDocs(q);
        const firestoreExisting = snapshot.docs.find(d => {
            const data = d.data();
            return data.participants.includes(therapistUid);
        });

        if (firestoreExisting) {
            const conv = { id: firestoreExisting.id, ...firestoreExisting.data() };
            openConversation(conv);
            return;
        }
    } catch (e) {
        console.error('Error checking existing conversations:', e);
    }

    // 3. No existing conversation — create a new one
    let therapistAvatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(therapistName)}&backgroundColor=e2e8f0`;
    try {
        const tDoc = await getDoc(doc(db, 'users', therapistUid));
        if (tDoc.exists() && tDoc.data().avatarUrl) {
            therapistAvatar = tDoc.data().avatarUrl;
        }
    } catch (e) { /* ignore */ }

    const myName = currentUserData?.fullName || currentUser.displayName || 'User';
    const myAvatar = currentUserData?.avatarUrl
        || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(myName)}&backgroundColor=e2e8f0`;

    // Build client profile snapshot for the therapist
    const clientProfile = buildClientProfile();

    // Create new conversation
    const convData = {
        participants: [currentUser.uid, therapistUid],
        participantNames: {
            [currentUser.uid]: myName,
            [therapistUid]: therapistName
        },
        participantAvatars: {
            [currentUser.uid]: myAvatar,
            [therapistUid]: therapistAvatar
        },
        clientProfile: clientProfile,
        lastMessage: 'Conversation started',
        lastMessageAt: serverTimestamp(),
        createdAt: serverTimestamp()
    };

    try {
        const convRef = await addDoc(collection(db, 'conversations'), convData);
        const newConv = { id: convRef.id, ...convData };

        // Add a system message with client info introduction
        await addDoc(collection(db, 'conversations', convRef.id, 'messages'), {
            senderId: 'system',
            type: 'system',
            text: `${myName} started a conversation. Client profile has been shared with the therapist.`,
            timestamp: serverTimestamp()
        });

        conversations.unshift(newConv);
        renderConversationList();
        openConversation(newConv);
    } catch (e) {
        console.error('Error creating conversation:', e);
        alert('Failed to start conversation. Please try again.');
    }
}

// =============================================
//  BUILD CLIENT PROFILE (shared with therapist)
// =============================================
function buildClientProfile() {
    if (!currentUserData) return {};

    return {
        fullName: currentUserData.fullName || '',
        age: currentUserData.age || '',
        gender: currentUserData.gender || '',
        occupation: currentUserData.occupation || '',
        // Assessment data (if available)
        assessmentTherapyType: currentUserData.assessmentTherapyType || '',
        assessmentReasons: currentUserData.assessmentReasons || [],
        assessmentPreferences: currentUserData.assessmentPreferences || {},
    };
}

// =============================================
//  OPEN CONVERSATION
// =============================================
function openConversation(conv) {
    currentConvId = conv.id;

    // UI states
    chatEmpty.style.display = 'none';
    chatActive.style.display = 'flex';

    // Close mobile sidebar
    chatSidebar.classList.remove('open');
    sidebarOverlay.classList.remove('active');

    // Highlight in list
    convList.querySelectorAll('.conv-item').forEach(el => {
        el.classList.toggle('active', el.dataset.convId === conv.id);
    });

    // Set header
    const otherUid = getOtherParticipant(conv);
    const otherName = (conv.participantNames && conv.participantNames[otherUid]) || 'Unknown';
    const otherAvatar = (conv.participantAvatars && conv.participantAvatars[otherUid])
        || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(otherName)}&backgroundColor=e2e8f0`;

    chatHeaderName.textContent = otherName;
    chatHeaderAvatar.src = otherAvatar;

    // Determine if current user is therapist in this conversation
    if (isTherapist) {
        chatHeaderMeta.textContent = 'Client';
        populateClientInfoPanel(conv);
        chatInfoToggle.style.display = 'block';
        chatRateBtn.style.display = 'none';
        currentTherapistUid = null;
    } else {
        chatHeaderMeta.textContent = 'Verified Therapist';
        populateTherapistInfoPanel(otherUid);
        chatInfoToggle.style.display = 'block';
        // Show rate button for clients
        chatRateBtn.style.display = 'block';
        currentTherapistUid = otherUid;
    }

    // Load messages with real-time listener
    loadMessages(conv.id);
}

// =============================================
//  CLIENT INFO PANEL (for therapists)
// =============================================
function populateClientInfoPanel(conv) {
    const cp = conv.clientProfile || {};
    const reasons = (cp.assessmentReasons || []).map(r => `<span class="info-tag">${escapeHtml(r)}</span>`).join('');
    const prefs = cp.assessmentPreferences || {};

    infoPanelBody.innerHTML = `
        <div class="info-section">
            <div class="info-section-title">Basic Information</div>
            <div class="info-row">
                <span class="info-label">Name</span>
                <span class="info-value">${escapeHtml(cp.fullName || 'N/A')}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Age</span>
                <span class="info-value">${cp.age || 'N/A'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Gender</span>
                <span class="info-value">${escapeHtml(cp.gender || 'N/A')}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Occupation</span>
                <span class="info-value">${escapeHtml(cp.occupation || 'N/A')}</span>
            </div>
        </div>

        ${cp.assessmentTherapyType ? `
        <div class="info-section">
            <div class="info-section-title">Therapy Sought</div>
            <div class="info-row">
                <span class="info-label">Type</span>
                <span class="info-value">${escapeHtml(cp.assessmentTherapyType)}</span>
            </div>
        </div>
        ` : ''}

        ${(cp.assessmentReasons && cp.assessmentReasons.length > 0) ? `
        <div class="info-section">
            <div class="info-section-title">Reasons for Seeking Help</div>
            <div class="info-tags">${reasons}</div>
        </div>
        ` : ''}

        ${(prefs.gender || prefs.age || prefs.language) ? `
        <div class="info-section">
            <div class="info-section-title">Preferences</div>
            ${prefs.gender ? `<div class="info-row"><span class="info-label">Gender Pref</span><span class="info-value">${escapeHtml(prefs.gender)}</span></div>` : ''}
            ${prefs.age ? `<div class="info-row"><span class="info-label">Age Pref</span><span class="info-value">${escapeHtml(prefs.age)}</span></div>` : ''}
            ${prefs.language ? `<div class="info-row"><span class="info-label">Language</span><span class="info-value">${escapeHtml(prefs.language)}</span></div>` : ''}
        </div>
        ` : ''}

        ${(!cp.assessmentTherapyType && (!cp.assessmentReasons || cp.assessmentReasons.length === 0)) ? `
        <div class="info-section">
            <div class="info-bio" style="border-left-color:#f59e0b;">
                <i class="ri-information-line" style="color:#f59e0b;"></i>
                This client hasn't completed their assessment yet. You can ask them about their needs during the conversation.
            </div>
        </div>
        ` : ''}
    `;
}

// =============================================
//  THERAPIST INFO PANEL (for clients)
// =============================================
async function populateTherapistInfoPanel(therapistUid) {
    infoPanelBody.innerHTML = '<div class="conv-loading" style="padding:2rem;"><i class="ri-loader-4-line ri-spin"></i><span>Loading...</span></div>';

    try {
        const appDoc = await getDoc(doc(db, 'therapistApplications', therapistUid));
        if (!appDoc.exists()) {
            infoPanelBody.innerHTML = '<p style="padding:1rem; color:var(--text-muted);">No therapist profile available.</p>';
            return;
        }

        const t = appDoc.data();
        const specialties = (t.specialties || []).map(s => `<span class="info-tag">${escapeHtml(s)}</span>`).join('');

        // Update panel header for therapist view
        document.querySelector('.info-panel-header h4').innerHTML = '<i class="ri-stethoscope-line"></i> Therapist Profile';

        infoPanelBody.innerHTML = `
            <div class="info-section">
                <div class="info-section-title">Credentials</div>
                <div class="info-row">
                    <span class="info-label">License</span>
                    <span class="info-value">${escapeHtml(t.licenseType || 'N/A')}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Experience</span>
                    <span class="info-value">${t.yearsExperience || 0} years</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Education</span>
                    <span class="info-value">${escapeHtml(t.education || 'N/A')}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Location</span>
                    <span class="info-value">${escapeHtml(t.city || '')}${t.city && t.country ? ', ' : ''}${escapeHtml(t.country || '')}</span>
                </div>
            </div>

            ${specialties ? `
            <div class="info-section">
                <div class="info-section-title">Specialties</div>
                <div class="info-tags">${specialties}</div>
            </div>
            ` : ''}

            ${t.bio ? `
            <div class="info-section">
                <div class="info-section-title">About</div>
                <div class="info-bio">${escapeHtml(t.bio)}</div>
            </div>
            ` : ''}

            ${t.therapeuticApproach ? `
            <div class="info-section">
                <div class="info-section-title">Approach</div>
                <div class="info-bio">${escapeHtml(t.therapeuticApproach)}</div>
            </div>
            ` : ''}
        `;
    } catch (e) {
        console.error('Error loading therapist info:', e);
        infoPanelBody.innerHTML = '<p style="padding:1rem; color:var(--text-muted);">Could not load therapist profile.</p>';
    }
}

// =============================================
//  LOAD MESSAGES (real-time)
// =============================================
function loadMessages(convId) {
    // Cleanup previous listener
    if (messageUnsub) messageUnsub();

    chatMessages.innerHTML = '';

    try {
        const q = query(
            collection(db, 'conversations', convId, 'messages'),
            orderBy('timestamp', 'asc')
        );

        messageUnsub = onSnapshot(q, (snapshot) => {
            chatMessages.innerHTML = '';
            let lastDate = '';

            const existingMsgIds = new Set();
            snapshot.docs.forEach(d => existingMsgIds.add(d.id));

            snapshot.docs.forEach(msgDoc => {
                const msg = msgDoc.data();
                const msgDate = formatDate(msg.timestamp);

                // Date divider
                if (msgDate !== lastDate) {
                    lastDate = msgDate;
                    const div = document.createElement('div');
                    div.className = 'msg-date-divider';
                    div.innerHTML = `<span>${msgDate}</span>`;
                    chatMessages.appendChild(div);
                }

                const el = document.createElement('div');

                if (msg.type === 'system') {
                    el.className = 'msg-system';
                    el.innerHTML = `<i class="ri-information-line"></i> ${escapeHtml(msg.text)}`;
                } else {
                    const isSent = msg.senderId === currentUser.uid;
                    el.className = `msg-bubble ${isSent ? 'msg-sent' : 'msg-received'}`;
                    el.dataset.msgId = msgDoc.id;
                    el.dataset.senderId = msg.senderId;

                    let quoteHtml = '';
                    if (msg.replyTo && existingMsgIds.has(msg.replyTo.id)) {
                        quoteHtml = `
                            <div class="msg-quote">
                                <div class="msg-quote-name">${escapeHtml(msg.replyTo.name)}</div>
                                <div class="msg-quote-text">${escapeHtml(msg.replyTo.text)}</div>
                            </div>
                        `;
                    }

                    el.innerHTML = `
                        ${quoteHtml}
                        <div class="msg-body">${escapeHtml(msg.text)}</div>
                        <div class="msg-meta">
                            <span class="msg-time">${formatTime(msg.timestamp)}</span>
                        </div>
                    `;

                    // Context menu on ALL messages
                    el.addEventListener('contextmenu', (e) => {
                        e.preventDefault();
                        const senderName = isSent ? (currentUserData?.fullName || 'Me') : chatHeaderName.textContent;
                        showMsgContextMenu(e, msgDoc.id, isSent, msg.text, senderName);
                    });
                }

                chatMessages.appendChild(el);
            });

            // Scroll to bottom
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }, (error) => {
            console.error('Message listener error:', error);
        });
    } catch (e) {
        console.error('Error loading messages:', e);
    }
}

// =============================================
//  SEND MESSAGE
// =============================================
async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text || !currentConvId || !currentUser) return;

    chatInput.value = '';
    chatInput.style.height = 'auto';

    try {
        const msgData = {
            senderId: currentUser.uid,
            text: text,
            timestamp: serverTimestamp()
        };

        if (activeReplyData) {
            msgData.replyTo = activeReplyData;
        }

        // Add message to subcollection
        await addDoc(collection(db, 'conversations', currentConvId, 'messages'), msgData);

        // Clear reply state
        activeReplyData = null;
        replyPreview.style.display = 'none';

        // Update conversation's last message
        await updateDoc(doc(db, 'conversations', currentConvId), {
            lastMessage: text,
            lastMessageAt: serverTimestamp()
        });
    } catch (e) {
        console.error('Error sending message:', e);
        alert('Failed to send message.');
    }
}

// Send button
chatSendBtn.addEventListener('click', sendMessage);

// Enter to send, Shift+Enter for newline
chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// Auto-resize textarea
chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 100) + 'px';
});

// =============================================
//  INFO PANEL TOGGLE
// =============================================
chatInfoToggle.addEventListener('click', () => {
    chatInfoPanel.classList.toggle('open');
    chatInfoToggle.classList.toggle('active');
});

infoPanelClose.addEventListener('click', () => {
    chatInfoPanel.classList.remove('open');
    chatInfoToggle.classList.remove('active');
});

// =============================================
//  MOBILE SIDEBAR
// =============================================
chatBackBtn.addEventListener('click', () => {
    chatSidebar.classList.add('open');
    sidebarOverlay.classList.add('active');
});

sidebarOverlay.addEventListener('click', () => {
    chatSidebar.classList.remove('open');
    sidebarOverlay.classList.remove('active');
});

// On mobile, show sidebar by default when no conversation is open
function handleMobileLayout() {
    if (window.innerWidth <= 768 && !currentConvId) {
        chatSidebar.classList.add('open');
    }
}

// =============================================
//  DELETE CHAT (entire conversation)
// =============================================
let pendingConfirmAction = null;

function showConfirm(title, text, onConfirm) {
    confirmTitle.textContent = title;
    confirmText.textContent = text;
    pendingConfirmAction = onConfirm;
    confirmModal.style.display = 'flex';
}

confirmCancel?.addEventListener('click', () => {
    confirmModal.style.display = 'none';
    pendingConfirmAction = null;
});

confirmModal?.addEventListener('click', (e) => {
    if (e.target === confirmModal) {
        confirmModal.style.display = 'none';
        pendingConfirmAction = null;
    }
});

confirmOk?.addEventListener('click', async () => {
    if (pendingConfirmAction) {
        confirmOk.textContent = 'Deleting...';
        confirmOk.disabled = true;
        await pendingConfirmAction();
        confirmOk.textContent = 'Delete';
        confirmOk.disabled = false;
        confirmModal.style.display = 'none';
        pendingConfirmAction = null;
    }
});

chatDeleteBtn?.addEventListener('click', () => {
    if (!currentConvId) return;
    showConfirm(
        'Delete Conversation',
        'Are you sure you want to delete this entire conversation? This action cannot be undone.',
        deleteCurrentConversation
    );
});

async function deleteCurrentConversation() {
    if (!currentConvId) return;

    try {
        // 1. Delete all messages in subcollection
        const msgsSnap = await getDocs(collection(db, 'conversations', currentConvId, 'messages'));
        const batch = writeBatch(db);
        msgsSnap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();

        // 2. Delete the conversation document
        await deleteDoc(doc(db, 'conversations', currentConvId));

        // 3. Unsubscribe message listener
        if (messageUnsub) { messageUnsub(); messageUnsub = null; }

        // 4. Remove from local list
        conversations = conversations.filter(c => c.id !== currentConvId);
        currentConvId = null;
        currentTherapistUid = null;

        // 5. Reset UI
        chatActive.style.display = 'none';
        chatEmpty.style.display = 'flex';
        renderConversationList();
    } catch (e) {
        console.error('Error deleting conversation:', e);
        alert('Failed to delete conversation. Please try again.');
    }
}

// =============================================
//  DELETE & REPLY INDIVIDUAL MESSAGE
// =============================================
let contextMenuMsgId = null;

function showMsgContextMenu(e, msgId, isSent, msgText, senderName) {
    contextMenuMsgId = msgId;

    // Show/hide delete button based on ownership
    ctxDeleteMsg.style.display = isSent ? 'flex' : 'none';

    // Store reply metadata temporarily
    ctxReplyMsg.dataset.msgId = msgId;
    ctxReplyMsg.dataset.text = msgText;
    ctxReplyMsg.dataset.name = senderName;

    // Calculate dimensions before showing (offsetWidth ignores transform scaling)
    msgContextMenu.classList.remove('visible');
    
    const menuWidth = msgContextMenu.offsetWidth || 180;
    // The height might change based on reply/delete visibility, so we use scrollHeight or a fallback
    const menuHeight = msgContextMenu.scrollHeight || 100;

    const clientWidth = document.documentElement.clientWidth || window.innerWidth;
    const clientHeight = document.documentElement.clientHeight || window.innerHeight;

    let left = e.clientX;
    let top = e.clientY;

    if (left + menuWidth > clientWidth) {
        left = clientWidth - menuWidth - 12;
    }
    if (top + menuHeight > clientHeight) {
        top = clientHeight - menuHeight - 12;
    }

    msgContextMenu.style.top = top + 'px';
    msgContextMenu.style.left = left + 'px';
    
    // Use requestAnimationFrame to ensure the new position is applied before transition
    requestAnimationFrame(() => {
        msgContextMenu.classList.add('visible');
    });
}

// Hide context menu on click outside
document.addEventListener('click', () => {
    msgContextMenu?.classList.remove('visible');
    contextMenuMsgId = null;
});

ctxReplyMsg?.addEventListener('click', () => {
    if (!contextMenuMsgId) return;

    activeReplyData = {
        id: ctxReplyMsg.dataset.msgId,
        text: ctxReplyMsg.dataset.text,
        name: ctxReplyMsg.dataset.name
    };

    replyPreviewName.textContent = activeReplyData.name;
    replyPreviewText.textContent = activeReplyData.text;
    replyPreview.style.display = 'flex';
    msgContextMenu.classList.remove('visible');
    chatInput.focus();
});

replyPreviewClose?.addEventListener('click', () => {
    activeReplyData = null;
    replyPreview.style.display = 'none';
});

ctxDeleteMsg?.addEventListener('click', () => {
    if (!contextMenuMsgId || !currentConvId) return;
    const msgIdToDelete = contextMenuMsgId;
    msgContextMenu.classList.remove('visible');
    showConfirm(
        'Delete Message',
        'Are you sure you want to delete this message? This cannot be undone.',
        () => deleteSingleMessage(msgIdToDelete)
    );
});

async function deleteSingleMessage(msgId) {
    if (!currentConvId || !msgId) return;

    try {
        await deleteDoc(doc(db, 'conversations', currentConvId, 'messages', msgId));

        // Update the conversation's lastMessage to the previous message
        const msgsSnap = await getDocs(
            query(
                collection(db, 'conversations', currentConvId, 'messages'),
                orderBy('timestamp', 'desc'),
                limit(1)
            )
        );

        if (msgsSnap.empty) {
            await updateDoc(doc(db, 'conversations', currentConvId), {
                lastMessage: 'Conversation started',
                lastMessageAt: serverTimestamp()
            });
        } else {
            const lastMsg = msgsSnap.docs[0].data();
            await updateDoc(doc(db, 'conversations', currentConvId), {
                lastMessage: lastMsg.text || 'Conversation started',
                lastMessageAt: lastMsg.timestamp || serverTimestamp()
            });
        }
    } catch (e) {
        console.error('Error deleting message:', e);
        alert('Failed to delete message. Please try again.');
    }
}

// =============================================
//  DELETE CONVERSATION FROM SIDEBAR (long-press / right-click)
// =============================================
function attachConvContextMenu(div, conv) {
    div.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showConfirm(
            'Delete Conversation',
            'Are you sure you want to delete this entire conversation? This cannot be undone.',
            async () => {
                // If this conversation is currently open, clean up
                if (currentConvId === conv.id) {
                    if (messageUnsub) { messageUnsub(); messageUnsub = null; }
                    currentConvId = null;
                    currentTherapistUid = null;
                    chatActive.style.display = 'none';
                    chatEmpty.style.display = 'flex';
                }

                try {
                    const msgsSnap = await getDocs(collection(db, 'conversations', conv.id, 'messages'));
                    const batch = writeBatch(db);
                    msgsSnap.docs.forEach(d => batch.delete(d.ref));
                    await batch.commit();
                    await deleteDoc(doc(db, 'conversations', conv.id));

                    conversations = conversations.filter(c => c.id !== conv.id);
                    renderConversationList();
                } catch (err) {
                    console.error('Error deleting conversation:', err);
                    alert('Failed to delete conversation.');
                }
            }
        );
    });
}
window.addEventListener('resize', handleMobileLayout);
handleMobileLayout();

// =============================================
//  RATING SYSTEM
// =============================================
const ratingModal = document.getElementById('rating-modal');
const starRating = document.getElementById('star-rating');
const starLabel = document.getElementById('star-label');
const ratingComment = document.getElementById('rating-comment');
const ratingCancel = document.getElementById('rating-cancel');
const ratingSubmit = document.getElementById('rating-submit');
let selectedRating = 0;

const ratingLabels = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];

// Open rating modal
chatRateBtn?.addEventListener('click', async () => {
    if (!currentTherapistUid || !currentUser) return;
    
    // Reset to defaults first
    selectedRating = 0;
    ratingComment.value = '';
    ratingSubmit.disabled = true;
    ratingSubmit.textContent = 'Submit Rating';
    starLabel.textContent = 'Loading past review...';
    starRating.querySelectorAll('i').forEach(s => {
        s.className = 'ri-star-line';
        s.classList.remove('selected', 'hovered');
    });
    ratingModal.style.display = 'flex';

    try {
        // Fetch existing rating
        const ratingDoc = await getDoc(doc(db, 'therapistApplications', currentTherapistUid, 'ratings', currentUser.uid));
        
        if (ratingDoc.exists()) {
            const data = ratingDoc.data();
            selectedRating = data.rating;
            ratingComment.value = data.comment || '';
            
            // Pre-fill stars
            starRating.querySelectorAll('i').forEach(s => {
                const v = parseInt(s.dataset.star);
                if (v <= selectedRating) { s.className = 'ri-star-fill selected'; }
                else { s.className = 'ri-star-line'; }
            });
            starLabel.textContent = ratingLabels[selectedRating];
            ratingSubmit.disabled = false;
            ratingSubmit.textContent = 'Update Rating';
        } else {
            starLabel.textContent = 'Select a rating';
        }
    } catch (e) {
        console.error('Error fetching existing rating:', e);
        starLabel.textContent = 'Select a rating';
    }
});

// Star hover effects
starRating?.addEventListener('mouseover', (e) => {
    const star = e.target.closest('i[data-star]');
    if (!star) return;
    const val = parseInt(star.dataset.star);
    starRating.querySelectorAll('i').forEach(s => {
        const v = parseInt(s.dataset.star);
        s.classList.toggle('hovered', v <= val);
        if (v <= val) s.className = 'ri-star-fill hovered';
        else if (v <= selectedRating) s.className = 'ri-star-fill selected';
        else s.className = 'ri-star-line';
    });
    starLabel.textContent = ratingLabels[val] || '';
});

starRating?.addEventListener('mouseout', () => {
    starRating.querySelectorAll('i').forEach(s => {
        const v = parseInt(s.dataset.star);
        s.classList.remove('hovered');
        if (v <= selectedRating) { s.className = 'ri-star-fill selected'; }
        else { s.className = 'ri-star-line'; }
    });
    starLabel.textContent = selectedRating > 0 ? ratingLabels[selectedRating] : 'Select a rating';
});

// Star click
starRating?.addEventListener('click', (e) => {
    const star = e.target.closest('i[data-star]');
    if (!star) return;
    selectedRating = parseInt(star.dataset.star);
    ratingSubmit.disabled = false;
    starRating.querySelectorAll('i').forEach(s => {
        const v = parseInt(s.dataset.star);
        if (v <= selectedRating) { s.className = 'ri-star-fill selected'; }
        else { s.className = 'ri-star-line'; }
    });
    starLabel.textContent = ratingLabels[selectedRating];
});

// Cancel
ratingCancel?.addEventListener('click', () => {
    ratingModal.style.display = 'none';
});

ratingModal?.addEventListener('click', (e) => {
    if (e.target === ratingModal) ratingModal.style.display = 'none';
});

// Submit rating
ratingSubmit?.addEventListener('click', async () => {
    if (!selectedRating || !currentTherapistUid || !currentUser) return;

    ratingSubmit.textContent = 'Submitting...';
    ratingSubmit.disabled = true;

    try {
        // Save individual rating
        await setDoc(doc(db, 'therapistApplications', currentTherapistUid, 'ratings', currentUser.uid), {
            rating: selectedRating,
            comment: ratingComment.value.trim(),
            userId: currentUser.uid,
            userName: currentUserData?.fullName || 'Anonymous',
            timestamp: serverTimestamp()
        });

        // Recalculate average rating
        const ratingsSnap = await getDocs(collection(db, 'therapistApplications', currentTherapistUid, 'ratings'));
        let total = 0, count = 0;
        ratingsSnap.forEach(d => { total += d.data().rating; count++; });
        const avgRating = count > 0 ? (total / count).toFixed(1) : 0;

        // Update therapist doc with average
        await updateDoc(doc(db, 'therapistApplications', currentTherapistUid), {
            avgRating: parseFloat(avgRating),
            ratingCount: count
        });

        ratingModal.style.display = 'none';
        ratingSubmit.textContent = 'Submit Rating';

        // Show a quick confirmation in chat
        await addDoc(collection(db, 'conversations', currentConvId, 'messages'), {
            senderId: 'system',
            type: 'system',
            text: `${currentUserData?.fullName || 'Client'} rated this therapist ${selectedRating}/5 ⭐`,
            timestamp: serverTimestamp()
        });
    } catch (e) {
        console.error('Error submitting rating:', e);
        alert('Failed to submit rating. Please try again.');
        ratingSubmit.textContent = 'Submit Rating';
        ratingSubmit.disabled = false;
    }
});

// =============================================
//  UTILITIES
// =============================================
function getOtherParticipant(conv) {
    return conv.participants.find(uid => uid !== currentUser.uid) || conv.participants[0];
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatTimeShort(timestamp) {
    if (!timestamp) return '';
    let date;
    if (timestamp.toDate) date = timestamp.toDate();
    else if (timestamp.seconds) date = new Date(timestamp.seconds * 1000);
    else date = new Date(timestamp);

    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    if (diff < 60) return 'Now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatTime(timestamp) {
    if (!timestamp) return '';
    let date;
    if (timestamp.toDate) date = timestamp.toDate();
    else if (timestamp.seconds) date = new Date(timestamp.seconds * 1000);
    else date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(timestamp) {
    if (!timestamp) return '';
    let date;
    if (timestamp.toDate) date = timestamp.toDate();
    else if (timestamp.seconds) date = new Date(timestamp.seconds * 1000);
    else date = new Date(timestamp);

    const today = new Date();
    if (date.toDateString() === today.toDateString()) return 'Today';
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
