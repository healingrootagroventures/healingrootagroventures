// Import the necessary Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { 
    getAuth, onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { 
    getFirestore, collection, getDocs, doc, deleteDoc, query, orderBy
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// --- CONFIGURATION CONSTANTS (MUST MATCH app.js) ---
const firebaseConfig = { 
    // !!! IMPORTANT: REPLICATE YOUR app.js CONFIG HERE !!!
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    projectId: "YOUR_PROJECT_ID",
    // ... rest of your config
};

// CONFIRMED ADMIN UID
const ADMIN_UID = "gKwgPDNJgsdcApIJch6NM9bKmf02";

// --- FIREBASE INITIALIZATION ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- UI CACHING ---
const authModal = document.getElementById('auth-modal');
const mainContent = document.querySelector('main');
const userListContainer = document.getElementById('user-list-container');
const postListContainer = document.getElementById('post-list-container');
const totalUsersSpan = document.getElementById('total-users');
const totalPostsSpan = document.getElementById('total-posts');
const logoutBtn = document.getElementById('logout-btn');


// --- CORE ADMIN AUTH CHECK ---
onAuthStateChanged(auth, (user) => {
    if (user && user.uid === ADMIN_UID) {
        // Logged in as Admin
        authModal.style.display = 'none';
        mainContent.style.display = 'block';
        loadAdminDashboard();
    } else {
        // Not logged in, or logged in as a regular user
        authModal.style.display = 'flex';
        mainContent.style.display = 'none';
        // Force log out if a regular user lands here
        if (user) signOut(auth);
    }
});

// --- ADMIN LOGIC FUNCTIONS ---

async function loadAdminDashboard() {
    console.log("Admin dashboard loading...");
    await loadUserManagement();
    await loadPostModeration();
}

/**
 * Loads all users and displays them for management.
 */
async function loadUserManagement() {
    userListContainer.innerHTML = '';
    const usersCollection = collection(db, "users");
    const snapshot = await getDocs(usersCollection);
    
    totalUsersSpan.textContent = snapshot.size;
    
    snapshot.forEach((doc) => {
        const user = doc.data();
        if (user.uid === ADMIN_UID) return; // Skip showing the admin in the list
        
        const userDiv = document.createElement('div');
        userDiv.className = 'user-admin-item';
        userDiv.style = 'border: 1px solid #ddd; padding: 10px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;';
        
        userDiv.innerHTML = `
            <span><strong>${user.email}</strong> (UID: ${user.uid.substring(0, 8)}...)</span>
            <button class="delete-user-btn button-primary" data-uid="${user.uid}" style="background-color: #cc0000;">
                <i class="fas fa-trash"></i> Delete User
            </button>
        `;
        userListContainer.appendChild(userDiv);
    });
    
    // Attach event listeners for delete buttons
    document.querySelectorAll('.delete-user-btn').forEach(btn => {
        btn.addEventListener('click', handleDeleteUser);
    });
}

/**
 * Handles the deletion of a user profile (Authentication deletion is separate and harder via client).
 */
async function handleDeleteUser(e) {
    const userId = e.currentTarget.dataset.uid;
    if (confirm(`Are you SURE you want to delete profile data for ${userId}? (Authentication deletion must be done in the Firebase Console)`)) {
        try {
            await deleteDoc(doc(db, "users", userId));
            alert(`User profile ${userId} deleted from Firestore!`);
            // Reload the list
            loadUserManagement();
        } catch (error) {
            console.error("Error deleting user:", error);
            alert("Failed to delete user profile. Check Firebase Rules.");
        }
    }
}

/**
 * Loads the most recent posts for moderation.
 */
async function loadPostModeration() {
    postListContainer.innerHTML = '';
    const postsCollection = collection(db, "posts");
    const postsQuery = query(postsCollection, orderBy("timestamp", "desc"));
    const snapshot = await getDocs(postsQuery);
    
    totalPostsSpan.textContent = snapshot.size;
    
    snapshot.docs.forEach((docSnap) => {
        const post = docSnap.data();
        
        const postDiv = document.createElement('div');
        postDiv.className = 'post-admin-item';
        postDiv.style = 'border: 1px solid #ddd; padding: 10px; margin-bottom: 10px;';

        postDiv.innerHTML = `
            <p><strong>Author:</strong> ${post.authorName || post.authorUID}</p>
            <p><strong>Content:</strong> ${post.content.substring(0, 100)}...</p>
            <p><strong>ID:</strong> ${docSnap.id}</p>
            <button class="delete-post-btn button-primary" data-post-id="${docSnap.id}" style="background-color: #cc0000;">
                <i class="fas fa-ban"></i> Delete Post
            </button>
        `;
        postListContainer.appendChild(postDiv);
    });

    document.querySelectorAll('.delete-post-btn').forEach(btn => {
        btn.addEventListener('click', handleDeletePost);
    });
}

/**
 * Handles the deletion of a post.
 */
async function handleDeletePost(e) {
    const postId = e.currentTarget.dataset.postId;
    if (confirm(`Are you SURE you want to delete post ID: ${postId}?`)) {
        try {
            // Note: Firebase Rules allow Admin to delete posts
            await deleteDoc(doc(db, "posts", postId));
            alert(`Post ${postId} deleted!`);
            loadPostModeration();
        } catch (error) {
            console.error("Error deleting post:", error);
            alert("Failed to delete post. Check Firebase Rules.");
        }
    }
}

// --- LOGOUT HANDLER ---

logoutBtn?.addEventListener('click', async () => {
    try {
        await signOut(auth);
        window.location.href = 'index.html'; // Redirect to main page after logout
    } catch (error) {
        console.error("Logout Error:", error);
        alert("Logout Failed.");
    }
});
