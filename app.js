import { products } from './products.js';

// --- CONFIGURATION CONSTANTS (Provided by User) ---
const firebaseConfig = {
  apiKey: "AIzaSyAgjMFw0dbM7CBH4S_zrmPhE69pp84Tpdo",
  authDomain: "healing-root-farm.firebaseapp.com",
  projectId: "healing-root-farm",
  storageBucket: "healing-root-farm.appspot.com",
  messagingSenderId: "1042258816994",
  appId: "1:1042258816994:web:0b6dd6b7f1c370ee7093bb"
};

const ADMIN_UID = "gKwgPDNJgsdcApIJch6NM9bKmf02";
const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/dd7dre9hd/upload";
const UPLOAD_PRESET = "unsigned_upload";

// --- FIREBASE INITIALIZATION ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, query, orderBy, onSnapshot, updateDoc, arrayUnion, arrayRemove, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- GLOBAL STATE & UI CACHING ---
let currentUser = null;
let currentProfile = null;
const productList = document.getElementById('product-list');
const authModal = document.getElementById('auth-modal');
const socialFeed = document.getElementById('social-feed');
const notificationCounter = document.getElementById('notification-counter');
const notificationDropdown = document.getElementById('notification-dropdown');

// --- CORE FUNCTIONS ---

// 1. Authentication Listener (Handles UI and data loading on sign-in/out)
onAuthStateChanged(auth, async (user) => {
    currentUser = user; 
    
    // Update Navigation Links
    document.querySelectorAll('[data-auth]').forEach(el => el.style.display = 'none');
    if (user) {
        document.querySelector('[data-auth="loggedIn"]').forEach(el => el.style.display = 'block');
        if (user.uid === ADMIN_UID) {
            document.getElementById('admin-link').style.display = 'block';
        }

        // Load User Profile and Start Real-time Social Listeners
        currentProfile = await getDoc(doc(db, "users", user.uid)).then(d => d.data());
        loadSocialFeed();
        setupNotificationListener(user.uid);
        
        // Hide Modal if open
        if(authModal) authModal.style.display = 'none';

    } else {
        document.querySelector('[data-auth="loggedOut"]').forEach(el => el.style.display = 'block');
        socialFeed.innerHTML = "<p class='intro-text'>Please log in to join the farmer community, chat, and shop.</p>";
    }
});

// 2. Cloudinary Upload
async function uploadProfilePicture(file) {
    if (!file) return "https://res.cloudinary.com/dd7dre9hd/image/upload/v1/default_avatar.png"; // Placeholder default

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', UPLOAD_PRESET);

    try {
        const response = await fetch(CLOUDINARY_URL, { method: 'POST', body: formData });
        const data = await response.json();
        return data.secure_url;
    } catch (error) {
        console.error("Cloudinary upload failed:", error);
        return "https://res.cloudinary.com/dd7dre9hd/image/upload/v1/default_avatar.png";
    }
}

// 3. User Profile Creation (Saves data to Firestore)
async function createUserProfile(uid, email, bio, profilePicUrl) {
    const isAdmin = (uid === ADMIN_UID);
    await setDoc(doc(db, "users", uid), {
        uid: uid,
        email: email,
        bio: bio,
        profilePicUrl: profilePicUrl,
        friends: [],
        isAdmin: isAdmin,
        postCount: 0,
        createdAt: serverTimestamp()
    });
}

// 4. Social Feed Listener & Renderer
function loadSocialFeed() {
    if (!socialFeed) return;
    socialFeed.innerHTML = '<h3>Loading Community Feed...</h3>';

    const q = query(collection(db, "posts"), orderBy("timestamp", "desc"));
    
    // Real-time listener for posts
    onSnapshot(q, (snapshot) => {
        let feedHTML = '';
        snapshot.docs.forEach(doc => {
            const post = doc.data();
            const postID = doc.id;
            const isLiked = post.likes.includes(currentUser.uid);
            
            feedHTML += `
                <div class="post-card" id="post-${postID}">
                    <div class="post-header">
                        <img src="${post.authorPic}" alt="PFP" class="post-pfp">
                        <strong>${post.authorName}</strong> 
                        <span class="post-time">${new Date(post.timestamp.toDate()).toLocaleDateString()}</span>
                    </div>
                    <p class="post-content">${post.content}</p>
                    <div class="post-actions">
                        <button class="action-btn like-btn ${isLiked ? 'liked' : ''}" data-post-id="${postID}">
                            ❤️ ${post.likes.length} Likes
                        </button>
                        <button class="action-btn comment-toggle" data-post-id="${postID}">
                            💬 ${post.comments.length} Comments
                        </button>
                    </div>
                    <div class="comments-section" id="comments-${postID}" style="display: none;">
                        ${post.comments.map(comment => `
                            <div class="comment"><strong>${comment.name}:</strong> ${comment.text}</div>
                        `).join('')}
                        <form class="comment-form" data-post-id="${postID}">
                            <input type="text" placeholder="Write a comment..." required>
                            <button type="submit">Post</button>
                        </form>
                    </div>
                </div>
            `;
        });
        socialFeed.innerHTML = feedHTML;
        
        // Re-attach event listeners after rendering
        document.querySelectorAll('.like-btn').forEach(btn => btn.addEventListener('click', handleLike));
        document.querySelectorAll('.comment-toggle').forEach(btn => btn.addEventListener('click', toggleComments));
        document.querySelectorAll('.comment-form').forEach(form => form.addEventListener('submit', handleComment));
    });
}

// 5. Handle Like Action
async function handleLike(e) {
    if (!currentUser) return alert('Please log in to interact.');
    const postID = e.currentTarget.dataset.postId;
    const postRef = doc(db, "posts", postID);
    
    const postDoc = await getDoc(postRef);
    const post = postDoc.data();
    
    const isLiked = post.likes.includes(currentUser.uid);
    
    if (isLiked) {
        // Unlike
        await updateDoc(postRef, {
            likes: arrayRemove(currentUser.uid)
        });
        // Delete notification (optional for complexity)
    } else {
        // Like
        await updateDoc(postRef, {
            likes: arrayUnion(currentUser.uid)
        });

        // Create notification for the post author
        if (post.authorUID !== currentUser.uid) {
             await addDoc(collection(db, "notifications"), {
                recipientUID: post.authorUID,
                senderName: currentProfile.email.split('@')[0], // Simplified name
                type: 'like',
                read: false,
                postId: postID,
                timestamp: serverTimestamp()
            });
        }
    }
}

// 6. Notification Listener
function setupNotificationListener(uid) {
    const q = query(collection(db, "notifications"), where("recipientUID", "==", uid), orderBy("timestamp", "desc"));
    
    onSnapshot(q, (snapshot) => {
        let unreadCount = 0;
        let dropdownHTML = '';

        snapshot.docs.forEach(doc => {
            const notif = doc.data();
            const time = notif.timestamp ? new Date(notif.timestamp.toDate()).toLocaleTimeString() : 'Just now';
            
            if (!notif.read) unreadCount++;

            dropdownHTML += `
                <div class="notification-item ${notif.read ? '' : 'unread'}" data-notif-id="${doc.id}">
                    ${notif.senderName} ${notif.type === 'like' ? 'liked your post' : 'commented on your post'} 
                    <span class="time">${time}</span>
                </div>
            `;
        });

        notificationCounter.textContent = unreadCount > 0 ? unreadCount : '';
        notificationDropdown.innerHTML = dropdownHTML || '<p style="padding: 10px;">No new notifications.</p>';
        
        document.querySelectorAll('.notification-item').forEach(item => item.addEventListener('click', markNotificationAsRead));
    });
}

// 7. Mark Notification as Read
async function markNotificationAsRead(e) {
    const notifID = e.currentTarget.dataset.notifId;
    await updateDoc(doc(db, "notifications", notifID), {
        read: true
    });
    // Optional: Redirect user to the post/profile
}

// 8. Handle Comment Submission
async function handleComment(e) {
    e.preventDefault();
    if (!currentUser) return alert('Please log in to comment.');
    
    const postID = e.target.dataset.postId;
    const commentText = e.target.querySelector('input').value;
    const postRef = doc(db, "posts", postID);
    
    const newComment = {
        uid: currentUser.uid,
        name: currentProfile.email.split('@')[0], // Simplified name
        text: commentText,
        timestamp: serverTimestamp()
    };
    
    await updateDoc(postRef, {
        comments: arrayUnion(newComment)
    });
    
    // Clear the input and create notification
    e.target.reset();
    
    // Create notification for the post author
    const postDoc = await getDoc(postRef);
    const post = postDoc.data();

    if (post.authorUID !== currentUser.uid) {
         await addDoc(collection(db, "notifications"), {
            recipientUID: post.authorUID,
            senderName: currentProfile.email.split('@')[0], 
            type: 'comment',
            read: false,
            postId: postID,
            timestamp: serverTimestamp()
        });
    }
}


// --- INITIALIZE UI & LISTENERS ---
document.addEventListener('DOMContentLoaded', () => {
    // Render static products on the shop page
    if (productList) {
        productList.innerHTML = products.map(p => 
            `<div class="product-card">...</div>` // Use full HTML from previous response
        ).join('');
    }

    // AUTH HANDLERS (Same as previous step, but ensuring all forms exist)
    const signupForm = document.getElementById('signup-form');
    const loginForm = document.getElementById('login-form');
    
    if (signupForm) signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        // Simplified Sign Up
        const email = e.target.email.value;
        const password = e.target.password.value;
        const bio = e.target.bio.value;
        const profilePicFile = document.getElementById('profile-pic-input').files[0];
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const picUrl = await uploadProfilePicture(profilePicFile);
            await createUserProfile(userCredential.user.uid, email, bio, picUrl);
            alert("Success! Welcome.");
        } catch (error) { alert(`Error: ${error.message}`); }
    });

    if (loginForm) loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        // Simplified Login
        try {
            await signInWithEmailAndPassword(auth, e.target.email.value, e.target.password.value);
        } catch (error) { alert(`Error: ${error.message}`); }
    });
    
    // Global functions for modal control
    window.toggleModal = () => {
        if(authModal.style.display === 'flex') {
            authModal.style.display = 'none';
        } else {
            authModal.style.display = 'flex';
        }
    }
    document.getElementById('login-link').addEventListener('click', toggleModal);
    document.querySelector('.close-button').addEventListener('click', toggleModal);
    document.getElementById('logout-link').addEventListener('click', handleLogout);
});
