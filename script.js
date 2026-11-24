"use strict";

const API_BASE = "https://www.creantunegocio.com";
const POSTS_URL = `${API_BASE}/faceposts`;
const PROFILE_URL = `${API_BASE}/faceprofile`;
const COMMENTS_URL = `${API_BASE}/facecomments`;
const LIKES_URL = `${API_BASE}/facelikes`;

const postForm = document.getElementById("postForm");
const postContent = document.getElementById("postContent");
const postImage = document.getElementById("postImage");
const publishBtn = document.getElementById("publishBtn");
const formStatus = document.getElementById("formStatus");
const feed = document.getElementById("feed");
const loginNotice = document.getElementById("loginNotice");
const loginLink = document.getElementById("loginLink");
const refreshBtn = document.getElementById("refreshBtn");

let currentUserId = null;
let sessionChecked = false;

document.getElementById("year").textContent = new Date().getFullYear();

function showStatus(element, message, type) {
    element.textContent = message;
    element.className = `status show ${type}`;
}

function hideStatus(element) {
    element.textContent = "";
    element.className = "status";
}

async function apiFetch(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        credentials: "include",
        headers: { ...(options.headers || {}) }
    });

    let data;
    try {
        data = await response.json();
    } catch {
        const error = new Error(`Respuesta inesperada del servidor (HTTP ${response.status}).`);
        error.status = response.status;
        throw error;
    }

    if (!response.ok || data.ok === false) {
        const error = new Error(data.error || `Error HTTP ${response.status}.`);
        error.status = response.status;
        throw error;
    }
    return data;
}

function getInitial(name) {
    return (name || "?").trim().charAt(0).toUpperCase() || "?";
}

function isHttpUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:";
    } catch {
        return false;
    }
}

function createAvatar(username, imageUrl) {
    const avatar = document.createElement("div");
    avatar.className = "avatar";

    if (imageUrl && isHttpUrl(imageUrl)) {
        const img = document.createElement("img");
        img.src = imageUrl;
        img.alt = `Foto de ${username || "usuario"}`;
        img.referrerPolicy = "no-referrer";
        img.addEventListener("error", () => {
            avatar.replaceChildren();
            avatar.textContent = getInitial(username);
        }, { once: true });
        avatar.appendChild(img);
    } else {
        avatar.textContent = getInitial(username);
    }
    return avatar;
}

function formatDate(value) {
    if (!value) return "Fecha no disponible";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString("es", { dateStyle:"medium", timeStyle:"short" });
}

function updateComposerState() {
    const canPublish = sessionChecked && currentUserId !== null;
    postContent.disabled = !canPublish;
    postImage.disabled = !canPublish;
    publishBtn.disabled = !canPublish;
}

async function loadCurrentUser() {
    currentUserId = null;
    sessionChecked = false;
    updateComposerState();

    try {
        const data = await apiFetch(PROFILE_URL);

        if (!data.user || data.user.id == null) {
            throw new Error(
                "El servidor no devolvió el ID del usuario. Revisa /faceprofile."
            );
        }

        const userId = Number(data.user.id);

        if (!Number.isSafeInteger(userId) || userId <= 0) {
            throw new Error("El ID del usuario no es válido.");
        }

        currentUserId = userId;

        loginNotice.textContent =
            `Hola, ${data.user.username || "usuario"}. ¡Comparte algo con la comunidad!`;

        loginLink.textContent = "Mi perfil";
        loginLink.href = "profile.html";

    } catch (error) {
        loginNotice.textContent =
            `No se pudo comprobar tu sesión: ${error.message}`;

        loginLink.textContent = "Entrar";
        loginLink.href = "login.html";

    } finally {
        sessionChecked = true;
        updateComposerState();
    }
}

/* ME GUSTA */
async function loadLikeState(postId, button, countElement) {
    try {
        const url = new URL(LIKES_URL);
        url.searchParams.set("post_id", postId);

        const data = await apiFetch(url.toString());
        countElement.textContent = `${Number(data.count) || 0} Me gusta`;
        button.classList.toggle("liked", Boolean(data.liked));
        button.setAttribute("aria-pressed", String(Boolean(data.liked)));
        button.textContent = data.liked ? "♥ Te gusta" : "♡ Me gusta";
        button.disabled = currentUserId === null;
        button.title = currentUserId === null ? "Inicia sesión para dar Me gusta" : "";
    } catch (error) {
        countElement.textContent = "No disponible";
        button.disabled = true;
        button.title = error.message;
    }
}

function createLikeSection(post) {
    const section = document.createElement("div");
    section.className = "post-actions";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "like-button";
    button.textContent = "♡ Me gusta";
    button.disabled = currentUserId === null;
    button.setAttribute("aria-pressed", "false");

    const count = document.createElement("span");
    count.className = "like-count";
    count.textContent = "Cargando...";

    button.addEventListener("click", async () => {
        if (currentUserId === null) {
            alert("Inicia sesión para dar Me gusta.");
            return;
        }

        button.disabled = true;

        try {
            /*
              POST /facelikes con {post_id: ID}.
              La API debe alternar el Me gusta: agregarlo si no existe
              y quitarlo si ya existe, y devolver el estado actualizado.
            */
            const data = await apiFetch(LIKES_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ post_id: Number(post.id) })
            });

            count.textContent = `${Number(data.count) || 0} Me gusta`;
            button.classList.toggle("liked", Boolean(data.liked));
            button.setAttribute("aria-pressed", String(Boolean(data.liked)));
            button.textContent = data.liked ? "♥ Te gusta" : "♡ Me gusta";
        } catch (error) {
            alert(`No se pudo actualizar el Me gusta: ${error.message}`);
            if (error.status === 401) {
                currentUserId = null;
                loginNotice.textContent = "Tu sesión expiró. Inicia sesión de nuevo.";
                updateComposerState();
            }
        } finally {
            button.disabled = currentUserId === null;
        }
    });

    section.append(button, count);
    loadLikeState(post.id, button, count);
    return section;
}

/* COMENTARIOS */
function createCommentElement(comment, postId, commentsList) {
    const wrapper = document.createElement("div");
    wrapper.className = "comment";
    wrapper.appendChild(createAvatar(comment.username, comment.profile_image));

    const body = document.createElement("div");
    body.className = "comment-body";

    const username = document.createElement("div");
    username.className = "comment-username";
    username.textContent = comment.username || "Usuario";

    const content = document.createElement("div");
    content.className = "comment-content";
    content.textContent = comment.content || "";

    const date = document.createElement("div");
    date.className = "comment-meta";
    date.textContent = formatDate(comment.created_at);

    body.append(username, content, date);

    if (currentUserId !== null && Number(comment.user_id) === currentUserId) {
        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "comment-delete";
        deleteBtn.textContent = "Eliminar comentario";

        deleteBtn.addEventListener("click", async () => {
            if (!confirm("¿Quieres eliminar este comentario?")) return;
            deleteBtn.disabled = true;

            try {
                await apiFetch(`${COMMENTS_URL}/${encodeURIComponent(comment.id)}`, {
                    method:"DELETE"
                });
                await loadComments(postId, commentsList);
            } catch (error) {
                alert(`No se pudo eliminar el comentario: ${error.message}`);
                deleteBtn.disabled = false;
            }
        });
        body.appendChild(deleteBtn);
    }

    wrapper.appendChild(body);
    return wrapper;
}

async function loadComments(postId, commentsList) {
    commentsList.replaceChildren();
    const loading = document.createElement("p");
    loading.className = "comment-message";
    loading.textContent = "Cargando comentarios...";
    commentsList.appendChild(loading);

    try {
        const url = new URL(COMMENTS_URL);
        url.searchParams.set("post_id", postId);
        const data = await apiFetch(url.toString());

        if (!Array.isArray(data.comments)) {
            throw new Error("La API no devolvió la lista de comentarios.");
        }

        commentsList.replaceChildren();

        if (data.comments.length === 0) {
            const empty = document.createElement("p");
            empty.className = "comment-message";
            empty.textContent = "Todavía no hay comentarios.";
            commentsList.appendChild(empty);
            return;
        }

        data.comments.forEach(comment => {
            commentsList.appendChild(createCommentElement(comment, postId, commentsList));
        });
    } catch (error) {
        commentsList.replaceChildren();
        const message = document.createElement("p");
        message.className = "comment-message";
        message.textContent = `No se pudieron cargar los comentarios: ${error.message}`;
        commentsList.appendChild(message);
    }
}

function createCommentForm(postId, commentsList) {
    const form = document.createElement("form");
    form.className = "comment-form";

    const input = document.createElement("input");
    input.className = "comment-input";
    input.type = "text";
    input.maxLength = 5000;
    input.placeholder = "Escribe un comentario...";
    input.setAttribute("aria-label", "Escribe un comentario");
    input.required = true;
    input.disabled = currentUserId === null;

    const button = document.createElement("button");
    button.type = "submit";
    button.className = "comment-submit";
    button.textContent = "Comentar";
    button.disabled = currentUserId === null;

    form.append(input, button);

    form.addEventListener("submit", async event => {
        event.preventDefault();
        const content = input.value.trim();
        if (!content) return;

        if (currentUserId === null) {
            alert("Inicia sesión para comentar.");
            return;
        }

        button.disabled = true;
        button.textContent = "Enviando...";

        try {
            await apiFetch(COMMENTS_URL, {
                method:"POST",
                headers: { "Content-Type":"application/json" },
                body: JSON.stringify({ post_id:Number(postId), content })
            });
            input.value = "";
            await loadComments(postId, commentsList);
        } catch (error) {
            alert(`No se pudo publicar el comentario: ${error.message}`);
            if (error.status === 401) {
                currentUserId = null;
                loginNotice.textContent = "Tu sesión expiró. Inicia sesión de nuevo.";
                updateComposerState();
            }
        } finally {
            button.disabled = currentUserId === null;
            button.textContent = "Comentar";
        }
    });

    return form;
}

function createPostCard(post) {
    const card = document.createElement("article");
    card.className = "card";

    const header = document.createElement("div");
    header.className = "post-header";
    header.appendChild(createAvatar(post.username, post.profile_image));

    const identity = document.createElement("div");
    const username = document.createElement("div");
    username.className = "post-user";
    username.textContent = post.username || "Usuario";

    const date = document.createElement("div");
    date.className = "post-date";
    date.textContent = formatDate(post.created_at);

    identity.append(username, date);
    header.appendChild(identity);
    card.appendChild(header);

    if (post.content) {
        const content = document.createElement("p");
        content.className = "post-content";
        content.textContent = post.content;
        card.appendChild(content);
    }

    if (post.image && isHttpUrl(post.image)) {
        const image = document.createElement("img");
        image.className = "post-image";
        image.src = post.image;
        image.alt = "Imagen de la publicación";
        image.loading = "lazy";
        image.referrerPolicy = "no-referrer";
        image.addEventListener("error", () => image.remove(), { once:true });
        card.appendChild(image);
    }

    card.appendChild(createLikeSection(post));

    if (currentUserId !== null && Number(post.user_id) === currentUserId) {
        const footer = document.createElement("div");
        footer.className = "post-footer";

        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "btn btn-danger";
        deleteBtn.textContent = "Eliminar";

        deleteBtn.addEventListener("click", async () => {
            if (!confirm("¿Seguro que quieres eliminar esta publicación?")) return;
            deleteBtn.disabled = true;

            try {
                await apiFetch(`${POSTS_URL}/${encodeURIComponent(post.id)}`, {
                    method:"DELETE"
                });
                await loadPosts();
            } catch (error) {
                alert(`No se pudo eliminar la publicación: ${error.message}`);
                deleteBtn.disabled = false;
            }
        });

        footer.appendChild(deleteBtn);
        card.appendChild(footer);
    }

    
    // Botón para agregar al autor de la publicación
    if (
        currentUserId !== null &&
        Number(post.user_id) !== currentUserId
    ) {
        const friendButton = document.createElement("button");

        friendButton.type = "button";
        friendButton.className = "friend-button";
        friendButton.textContent = "Agregar amigo";

        friendButton.addEventListener("click", async () => {
            friendButton.disabled = true;
            friendButton.textContent = "Enviando...";

            try {
                await apiFetch(`${API_BASE}/facefriends`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        action: "send",
                        receiver_id: Number(post.user_id)
                    })
                });

                friendButton.textContent = "Solicitud enviada";
                await loadFriendList("sent");

            } catch (error) {
                alert(error.message);
                friendButton.disabled = false;
                friendButton.textContent = "Agregar amigo";
            }
        });

        const friendButtonContainer = document.createElement("div");
        friendButtonContainer.style.marginTop = "10px";
        friendButtonContainer.appendChild(friendButton);
        card.appendChild(friendButtonContainer);
    }

    const commentsSection = document.createElement("section");
    commentsSection.className = "comments";

    const title = document.createElement("h3");
    title.className = "comments-title";
    title.textContent = "Comentarios";
    commentsSection.appendChild(title);

    if (currentUserId !== null) {
        const commentsList = document.createElement("div");
        commentsList.className = "comments-list";
        commentsSection.appendChild(createCommentForm(post.id, commentsList));
        commentsSection.appendChild(commentsList);
        loadComments(post.id, commentsList);
    } else {
        const notice = document.createElement("p");
        notice.className = "comment-login";
        notice.textContent = "Inicia sesión para escribir comentarios.";
        commentsSection.appendChild(notice);

        const commentsList = document.createElement("div");
        commentsList.className = "comments-list";
        commentsSection.appendChild(commentsList);
        loadComments(post.id, commentsList);
    }

    card.appendChild(commentsSection);
    return card;
}

async function loadPosts() {
    feed.replaceChildren();
    const loading = document.createElement("div");
    loading.className = "card loading";
    loading.textContent = "Cargando publicaciones...";
    feed.appendChild(loading);

    try {
        const data = await apiFetch(POSTS_URL);
        if (!Array.isArray(data.posts)) {
            throw new Error("La API no devolvió una lista de publicaciones.");
        }

        feed.replaceChildren();

        if (data.posts.length === 0) {
            const empty = document.createElement("div");
            empty.className = "card empty";
            empty.textContent = "Todavía no hay publicaciones. ¡Sé el primero en compartir algo!";
            feed.appendChild(empty);
            return;
        }

        data.posts.forEach(post => feed.appendChild(createPostCard(post)));
    } catch (error) {
        feed.replaceChildren();
        const message = document.createElement("div");
        message.className = "card empty";
        message.textContent = `No se pudieron cargar las publicaciones: ${error.message}`;
        feed.appendChild(message);
    }
}

postForm.addEventListener("submit", async event => {
    event.preventDefault();
    hideStatus(formStatus);

    if (!sessionChecked || currentUserId === null) {
        showStatus(formStatus, "Inicia sesión para publicar.", "error");
        return;
    }

    const content = postContent.value.trim();
    const image = postImage.value.trim();

    if (!content && !image) {
        showStatus(formStatus, "Escribe algo o agrega una URL de imagen.", "error");
        return;
    }

    if (image && !isHttpUrl(image)) {
        showStatus(formStatus, "La imagen debe tener una URL HTTP o HTTPS válida.", "error");
        return;
    }

    publishBtn.disabled = true;
    publishBtn.textContent = "Publicando...";

    try {
        await apiFetch(POSTS_URL, {
            method:"POST",
            headers: { "Content-Type":"application/json" },
            body: JSON.stringify({ content, image:image || null })
        });

        postContent.value = "";
        postImage.value = "";
        showStatus(formStatus, "¡Publicación creada correctamente!", "success");
        await loadPosts();
    } catch (error) {
        showStatus(formStatus, `No se pudo publicar: ${error.message}`, "error");
        if (error.status === 401) {
            currentUserId = null;
            loginNotice.textContent = "Tu sesión expiró. Inicia sesión de nuevo.";
            updateComposerState();
        }
    } finally {
        publishBtn.textContent = "Publicar";
        updateComposerState();
    }
});

refreshBtn.addEventListener("click", async () => {
    refreshBtn.disabled = true;
    refreshBtn.textContent = "Actualizando...";
    try {
        await loadCurrentUser();
        await loadPosts();
    } finally {
        refreshBtn.disabled = false;
        refreshBtn.textContent = "Actualizar";
    }
});

async function initializePage() {
    await loadCurrentUser();
    await loadPosts();
}

initializePage();

fetch("https://www.creantunegocio.com/facenotifications", {
    method: "GET",
    credentials: "include"
})
.then(res => res.json())
.then(data => {
    console.log(data);
});
 