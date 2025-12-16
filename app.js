// Import the necessary Firebase modules
import { products } from './products.js'; 
import { 
    initializeApp 
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { 
    getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut 
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { 
    getFirestore, doc, setDoc, getDoc, getDocs, collection, query, where, orderBy, onSnapshot, updateDoc, arrayUnion, arrayRemove, addDoc, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// --- CONFIGURATION CONSTANTS (NEW FIREBASE CONFIG) ---
const firebaseConfig = { 
    apiKey: "AIzaSyBYsQnVQM62Q1xo0-RvA7OxY-3_EZefmxU",
    authDomain: "healing-root-web.firebaseapp.com",
    projectId: "healing-root-web",
    storageBucket: "healing-root-web.firebasestorage.app",
    messagingSenderId: "724545274258",
    appId: "1:724545274258:web:aa539eacfd656f85c0414b",
    measurementId: "G-3B33ENKJFJ"
};

// !!! UPDATED ADMIN UID !!!
const ADMIN_UID = "zqq3aNV8HqdkcnvRKosTE40YbIn2"; 
// NOTE: Please ensure your Cloudinary URL and UPLOAD_PRESET are correct for your NEW account
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

// UI Elements
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

// Auth Forms
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const logoutBtn = document.getElementById('logout-btn');


// --- HELPER FUNCTIONS ---

/**
 * Uploads an image file to Cloudinary and returns the URL.
 */
async function uploadProfilePicture(file) {
    if (!file) {
        return "https://res.cloudinary.com/dd7dre9hd/image/upload/v1678886400/default_pfp.png"; 
    }
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', UPLOAD_PRESET);

    try {
        const response = await fetch(CLOUDINARY_URL, {
            method: 'POST',
            body: formData,
        });
        if (!response.ok) {
            throw new Error(`Cloudinary upload failed: ${response.statusText}`);
        }
        const data = await response.json();
        return data.secure_url;
    } catch (error) {
        console.error("Cloudinary Upload Error:", error);
        throw new Error("Failed to upload profile picture.");
    }
}

/**
 * Creates the custom user profile document in Firestore.
 */
async function createUserProfile(uid, email, bio, profilePicUrl) {
    const isAdmin = (uid === ADMIN_UID);

    await setDoc(doc(db, "users", uid), {
        uid: uid,
        email: email,
        bio: bio,
        profilePicUrl: profilePicUrl,
        isAdmin: isAdmin,
        friends: [],
        pendingRequests: []
    });
}

// --- AUTHENTICATION HANDLERS ---

logoutBtn?.addEventListener('click', async () => {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Logout Error:", error);
        alert("Logout Failed.");
    }
});


if (loginForm) loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = e.target.email.value;
    const password = e.target.password.value;

    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        console.error("Login Failed:", error);
        alert(`Login Failed: ${error.message}`);
    }
});

if (signupForm) signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = e.target.email.value;
    const password = e.target.password.value;
    const bio = e.target.bio.value || "New member on the platform!";
    const profilePicFile = document.getElementById('profile-pic-input')?.files[0];
    
    try {
        // 1. FIREBASE AUTH CREATION
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        console.log("LOG 1: SUCCESS - User created in Firebase Auth.", userCredential.user.uid);
        
        // 2. CLOUDINARY UPLOAD (and get URL)
        const picUrl = await uploadProfilePicture(profilePicFile);
        console.log("LOG 2: SUCCESS - Profile picture URL obtained:", picUrl);
        
        // 3. FIRESTORE PROFILE CREATION (This is where the rules apply)
        await createUserProfile(userCredential.user.uid, email, bio, picUrl);
        console.log("LOG 3: SUCCESS - Profile written to Firestore.");
        
        alert("Account created successfully! Welcome.");
    } catch (error) { 
        console.error("🔥🔥🔥 FINAL SIGNUP FAILURE POINT 🔥🔥🔥:", error);
        alert(`Error during signup: ${error.message}`); 
    }
});

// --- CORE AUTHENTICATION LISTENER ---
onAuthStateChanged(auth, async (user) => {
    currentUser = user; 
    
    if (user) {
        loadingStatus.style.display = 'none';
        
        // 1. Load Profile
        const docSnap = await getDoc(doc(db, "users", user.uid));
        currentProfile = docSnap.exists() ? docSnap.data() : null;
        
        if (!currentProfile) {
            console.error("User profile missing in Firestore!");
            await signOut(auth); 
            alert("Error: Incomplete profile data. Please try logging in or signing up again.");
            return;
        }

        // 2. Update UI & Display Content
        contentWrapper.style.display = 'block';
        authModal.style.display = 'none';
        
        document.querySelectorAll('[data-auth="loggedIn"]').forEach(el => el.style.display = 'block');
        document.querySelectorAll('[data-auth="loggedOut"]').forEach(el => el.style.display = 'none');
        
        if (user.uid === ADMIN_UID) {
            document.getElementById('admin-link').style.display = 'block';
        } else {
            document.getElementById('admin-link').style.display = 'none';
        }

        // 3. Start Real-time Listeners
        loadSocialFeed();
        setupNotificationListener(user.uid);
        setupFriendshipListener(user.uid);

    } else {
        loadingStatus.style.display = 'none';
        contentWrapper.style.display = 'none';
        authModal.style.display = 'flex';
        document.querySelectorAll('[data-auth="loggedIn"]').forEach(el => el.style.display = 'none');
        document.querySelectorAll('[data-auth="loggedOut"]').forEach(el => el.style.display = 'block');
    }
});


// --- POSTS & REAL-TIME INTERACTION FUNCTIONS (PLACEHOLDERS) ---

function loadSocialFeed() { 
    console.log("Starting social feed listener...");
    const postsQuery = query(collection(db, "posts"), orderBy("timestamp", "desc"));
    
    onSnapshot(postsQuery, (snapshot) => {
        socialFeed.innerHTML = '';
        snapshot.docs.forEach(doc => {
            const post = doc.data();
            const postElement = document.createElement('div');
            postElement.className = 'post-card';
            postElement.innerHTML = `
                <div class="post-header">
                    <img src="${post.authorPfp || 'default.png'}" class="post-pfp">
                    <strong>${post.authorName || post.authorUID}</strong>
                    <small>(${new Date(post.timestamp?.toDate()).toLocaleTimeString()})</small>
                </div>
                <p>${post.content}</p>
                <div class="post-actions">
                    <button class="like-btn" data-post-id="${doc.id}">Like (${post.likes?.length || 0})</button>
                </div>
            `;
            socialFeed.appendChild(postElement);
        });
    });
}
function handleLike(e) { /* Must be fully implemented */ }
function handleComment(e) { /* Must be fully implemented */ }
function setupNotificationListener(uid) { 
    console.log(`Setting up notification listener for ${uid}`);
    const q = query(collection(db, "notifications"), where("recipientUID", "==", uid), orderBy("timestamp", "desc"));

    onSnapshot(q, (snapshot) => {
        let unreadCount = 0;
        snapshot.docs.forEach(doc => {
            if (!doc.data().read) {
                unreadCount++;
            }
        });
        notificationCounter.textContent = unreadCount > 0 ? unreadCount : '';
        notificationCounter.style.display = unreadCount > 0 ? 'block' : 'none';
    });
}


// --- FRIENDSHIP & CHAT FUNCTIONS (EXISTING) ---

document.getElementById('user-search-btn')?.addEventListener('click', async () => {
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
            pendingRequests: arrayUnion(currentUser.uid) 
        });
        alert("Friend request sent!");
        document.getElementById('search-results').innerHTML = '';
    } catch (error) {
        console.error("Error sending request:", error);
        alert("Failed to send request.");
    }
}

function setupFriendshipListener(uid) {
    onSnapshot(doc(db, "users", uid), (docSnap) => {
        if (docSnap.exists()) {
            const user = docSnap.data();
            currentProfile = user;
            renderFriends(user.friends);
            renderFriendRequests(user.pendingRequests);
        }
    });
}

async function renderFriends(friendUids) {
    myFriendsList.innerHTML = '';
    if (friendUids.length === 0) {
        myFriendsList.innerHTML = '<p>You have no friends yet.</p>';
        return;
    }

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

async function renderFriendRequests(requestUids) {
    friendRequestsReceived.innerHTML = '';
    if (!requestUids || requestUids.length === 0) {
        friendRequestsReceived.innerHTML = '<p>No pending requests.</p>';
        return;
    }

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

function handleFriendRequest(action) {
    return async (e) => {
        const senderUID = e.currentTarget.dataset.senderUid;
        const senderRef = doc(db, "users", senderUID);
        const recipientRef = doc(db, "users", currentUser.uid);

        if (action === 'accept') {
            await updateDoc(recipientRef, { pendingRequests: arrayRemove(senderUID) });
            await updateDoc(recipientRef, { friends: arrayUnion(senderUID) });
            await updateDoc(senderRef, { friends: arrayUnion(currentUser.uid) });
            alert(`You are now friends with ${senderUID.substring(0, 5)}...`);
        } else if (action === 'reject') {
            await updateDoc(recipientRef, { pendingRequests: arrayRemove(senderUID) });
            alert(`Request from ${senderUID.substring(0, 5)}... rejected.`);
        }
    }
}

async function startChat(e) {
    const friendUID = e.currentTarget.dataset.uid;
    activeChatFriendUID = friendUID;

    const participants = [currentUser.uid, friendUID].sort();
    const chatID = participants.join('_');
    currentChatID = chatID;

    const friendProfile = await getDoc(doc(db, "users", friendUID)).then(d => d.data());
    document.getElementById('chat-window').previousElementSibling.textContent = `💬 Chat with ${friendProfile.email.split('@')[0]}`;
    document.getElementById('chat-form').style.display = 'flex';
    document.getElementById('messages-display').innerHTML = ''; 
    
    await setDoc(doc(db, "chats", chatID), { 
        participants: participants, 
        lastMessageAt: serverTimestamp() 
    }, { merge: true });

    setupMessageListener(chatID);
}

function setupMessageListener(chatID) {
    const q = query(collection(db, "chats", chatID, "messages"), orderBy("timestamp", "asc"));
    
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
        messagesDisplay.scrollTop = messagesDisplay.scrollHeight;
    });
}

chatForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = messageInput.value.trim();
    if (!text || !currentChatID) return;

    await addDoc(collection(db, "chats", currentChatID, "messages"), {
        senderUID: currentUser.uid,
        text: text,
        timestamp: serverTimestamp()
    });
    
    await updateDoc(doc(db, "chats", currentChatID), {
        lastMessageText: text,
        lastMessageAt: serverTimestamp()
    });

    messageInput.value = '';
});
