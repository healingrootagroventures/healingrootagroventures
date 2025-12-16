// NOTE: Make sure to re-import all necessary Firebase and project files
import { products } from './products.js'; // Assuming you still need this file
import { 
    initializeApp 
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { 
    getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut 
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { 
    getFirestore, doc, setDoc, getDoc, collection, query, where, orderBy, onSnapshot, updateDoc, arrayUnion, arrayRemove, addDoc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// --- CONFIGURATION CONSTANTS ---
const firebaseConfig = { 
    // YOUR CONFIG HERE (Ensure it is correct!)
};
const ADMIN_UID = "gKwgPDNJgsdcApIJch6NM9bKmf02";
const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/dd7dre9hd/upload"; 
const UPLOAD_PRESET = "unsigned_upload";

// --- FIREBASE INITIALIZATION ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- GLOBAL STATE & UI CACHING ---
let currentUser = null;
let currentProfile = null;
let activeChatFriendUID = null;
let currentChatID = null;

const contentWrapper = document.getElementById('content-wrapper');
const authModal = document.getElementById('auth-modal');
const socialFeed = document.getElementById('social-feed');
const loadingStatus = document.getElementById('loading-status');
const notificationCounter = document.getElementById('notification-counter');
const myFriendsList = document.getElementById('my-friends-list');
const friendRequestsReceived = document.getElementById('friend-requests-received');
const messagesDisplay = document.getElementById('messages-display');
const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');


// --- CORE AUTHENTICATION LISTENER ---
onAuthStateChanged(auth, async (user) => {
    currentUser = user; 
    
    if (user) {
        loadingStatus.style.display = 'none';
        
        // 1. Load Profile
        const docSnap = await getDoc(doc(db, "users", user.uid));
        currentProfile = docSnap.exists() ? docSnap.data() : null;
        if (!currentProfile) {
            // Handle incomplete profile (should not happen if signup works)
            console.error("User profile missing!");
            return;
        }

        // 2. Update UI & Display Content
        contentWrapper.style.display = 'block';
        authModal.style.display = 'none';
        
        document.querySelectorAll('[data-auth="loggedIn"]').forEach(el => el.style.display = 'block');
        document.querySelectorAll('[data-auth="loggedOut"]').forEach(el => el.style.display = 'none');
        if (user.uid === ADMIN_UID) {
            document.getElementById('admin-link').style.display = 'block';
        }

        // 3. Start Real-time Listeners
        loadSocialFeed();
        setupNotificationListener(user.uid);
        setupFriendshipListener(user.uid);

    } else {
        // User logged out
        loadingStatus.style.display = 'none';
        contentWrapper.style.display = 'none';
        authModal.style.display = 'flex';
        document.querySelectorAll('[data-auth="loggedIn"]').forEach(el => el.style.display = 'none');
        document.querySelectorAll('[data-auth="loggedOut"]').forEach(el => el.style.display = 'block');
    }
});


// --- POSTS & REAL-TIME INTERACTION FUNCTIONS (Same as previous step, ensure they are imported/defined) ---

// Placeholder functions (You need to ensure these are defined/imported correctly):
// function loadSocialFeed() { ... }
// function handleLike(e) { ... }
// function handleComment(e) { ... }
// function setupNotificationListener(uid) { ... }


// --- FRIENDSHIP & CHAT FUNCTIONS (NEW) ---

// 1. Friend Search & Request
document.getElementById('user-search-btn').addEventListener('click', async () => {
    const email = document.getElementById('user-search-input').value;
    if (!email) return;

    const q = query(collection(db, "users"), where("email", "==", email));
    const snapshot = await getDocs(q);
    const resultsDiv = document.getElementById('search-results');
    resultsDiv.innerHTML = '';

    if (snapshot.empty || snapshot.docs[0].id === currentUser.uid) {
        resultsDiv.innerHTML = '<p>User not found or you searched for yourself.</p>';
        return;
    }
    
    const user = snapshot.docs[0].data();
    resultsDiv.innerHTML = `
        <div class="user-result">
            <p>Found: <strong>${user.email.split('@')[0]}</strong></p>
            <button class="send-request-btn" data-uid="${user.uid}">Send Friend Request</button>
        </div>
    `;
    document.querySelector('.send-request-btn').addEventListener('click', sendFriendRequest);
});

async function sendFriendRequest(e) {
    const recipientUID = e.currentTarget.dataset.uid;
    if (currentProfile.friends.includes(recipientUID) || currentProfile.pendingRequests.includes(recipientUID)) {
        alert("Already friends or request already sent.");
        return;
    }

    try {
        await updateDoc(doc(db, "users", recipientUID), {
            // Add current user's UID to recipient's pendingRequests array
            pendingRequests: arrayUnion(currentUser.uid) 
        });
        alert("Friend request sent!");
        document.getElementById('search-results').innerHTML = ''; // Clear results
    } catch (error) {
        console.error("Error sending request:", error);
        alert("Failed to send request.");
    }
}

// 2. Real-time Friendship Listener
function setupFriendshipListener(uid) {
    onSnapshot(doc(db, "users", uid), (docSnap) => {
        if (docSnap.exists()) {
            const user = docSnap.data();
            currentProfile = user; // Update global state
            renderFriends(user.friends);
            renderFriendRequests(user.pendingRequests);
        }
    });
}

// 3. Render Friends List
async function renderFriends(friendUids) {
    myFriendsList.innerHTML = '';
    if (friendUids.length === 0) {
        myFriendsList.innerHTML = '<p>You have no friends yet.</p>';
        return;
    }

    // Fetch friend profiles
    const friendProfiles = await Promise.all(
        friendUids.map(uid => getDoc(doc(db, "users", uid)))
    );

    friendProfiles.forEach(docSnap => {
        if (docSnap.exists()) {
            const friend = docSnap.data();
            const li = document.createElement('div');
            li.className = 'friend-item';
            li.innerHTML = `
                <img src="${friend.profilePicUrl}" class="pfp-small">
                <span>${friend.email.split('@')[0]}</span>
                <button data-uid="${friend.uid}" class="chat-start-btn">Chat</button>
            `;
            li.querySelector('.chat-start-btn').addEventListener('click', startChat);
            myFriendsList.appendChild(li);
        }
    });
}

// 4. Render Friend Requests
async function renderFriendRequests(requestUids) {
    friendRequestsReceived.innerHTML = '';
    if (!requestUids || requestUids.length === 0) {
        friendRequestsReceived.innerHTML = '<p>No pending requests.</p>';
        return;
    }

    // Fetch request sender profiles
    const senderProfiles = await Promise.all(
        requestUids.map(uid => getDoc(doc(db, "users", uid)))
    );

    senderProfiles.forEach(docSnap => {
        if (docSnap.exists()) {
            const sender = docSnap.data();
            const div = document.createElement('div');
            div.className = 'request-item';
            div.innerHTML = `
                <span>${sender.email.split('@')[0]} sent you a request.</span>
                <button data-sender-uid="${sender.uid}" class="accept-btn">Accept</button>
                <button data-sender-uid="${sender.uid}" class="reject-btn">Reject</button>
            `;
            div.querySelector('.accept-btn').addEventListener('click', handleFriendRequest('accept'));
            div.querySelector('.reject-btn').addEventListener('click', handleFriendRequest('reject'));
            friendRequestsReceived.appendChild(div);
        }
    });
}

// 5. Handle Friend Request (Accept/Reject)
function handleFriendRequest(action) {
    return async (e) => {
        const senderUID = e.currentTarget.dataset.senderUid;
        const senderRef = doc(db, "users", senderUID);
        const recipientRef = doc(db, "users", currentUser.uid);

        if (action === 'accept') {
            // 1. Remove request from recipient's pendingRequests
            await updateDoc(recipientRef, { pendingRequests: arrayRemove(senderUID) });
            // 2. Add both to each other's friends array
            await updateDoc(recipientRef, { friends: arrayUnion(senderUID) });
            await updateDoc(senderRef, { friends: arrayUnion(currentUser.uid) });
            alert(`You are now friends with ${senderUID.substring(0, 5)}...`);
        } else if (action === 'reject') {
            // 1. Only remove request from recipient's pendingRequests
            await updateDoc(recipientRef, { pendingRequests: arrayRemove(senderUID) });
            alert(`Request from ${senderUID.substring(0, 5)}... rejected.`);
        }
    }
}

// 6. Start/Select Chat (Find or Create Chat Document)
async function startChat(e) {
    const friendUID = e.currentTarget.dataset.uid;
    activeChatFriendUID = friendUID;

    // Determine the chat ID by sorting UIDs to ensure consistency
    const participants = [currentUser.uid, friendUID].sort();
    const chatID = participants.join('_');
    currentChatID = chatID;

    // Display friend's name in chat header
    const friendProfile = await getDoc(doc(db, "users", friendUID)).then(d => d.data());
    document.getElementById('chat-window').querySelector('h3').textContent = `💬 Chat with ${friendProfile.email.split('@')[0]}`;
    document.getElementById('chat-form').style.display = 'flex';
    document.getElementById('messages-display').innerHTML = ''; // Clear previous messages
    
    // Ensure chat document exists (or create it)
    await setDoc(doc(db, "chats", chatID), { 
        participants: participants, 
        lastMessageAt: serverTimestamp() 
    }, { merge: true });

    // Start real-time message listener
    setupMessageListener(chatID);
}

// 7. Real-time Message Listener
function setupMessageListener(chatID) {
    const q = query(collection(db, "chats", chatID, "messages"), orderBy("timestamp", "asc"));
    
    // Unsubscribe from previous listener if active
    if (window.unsubscribeMessages) window.unsubscribeMessages(); 

    window.unsubscribeMessages = onSnapshot(q, (snapshot) => {
        messagesDisplay.innerHTML = '';
        snapshot.docs.forEach(doc => {
            const message = doc.data();
            const isMe = message.senderUID === currentUser.uid;
            
            const messageDiv = document.createElement('div');
            messageDiv.className = `message-bubble ${isMe ? 'mine' : 'theirs'}`;
            messageDiv.textContent = message.text;
            messagesDisplay.appendChild(messageDiv);
        });
        // Scroll to bottom of chat
        messagesDisplay.scrollTop = messagesDisplay.scrollHeight;
    });
}

// 8. Handle Chat Message Submission
chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = messageInput.value.trim();
    if (!text || !currentChatID) return;

    await addDoc(collection(db, "chats", currentChatID, "messages"), {
        senderUID: currentUser.uid,
        text: text,
        timestamp: serverTimestamp()
    });
    
    // Update the parent chat document for sorting/last message preview
    await updateDoc(doc(db, "chats", currentChatID), {
        lastMessageText: text,
        lastMessageAt: serverTimestamp()
    });

    messageInput.value = '';
});


// --- ADMIN DASHBOARD & OTHER UI FUNCTIONS (As per previous steps) ---

// (Ensure your login/signup/logout handlers and Cloudinary upload function are still present)
