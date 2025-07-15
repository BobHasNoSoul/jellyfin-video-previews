(function() {
    // Configuration section
    // previewStartTime: Start time for previews in seconds (e.g., 1800 for 30 minutes)
    // playbackSpeed: Playback speed for previews (e.g., 2.0 for 2x speed)
    // hoverDelay: Delay before playing preview in milliseconds
    // transcodeWidth: Width for transcoded video in pixels (default 320)
    const config = {
        previewStartTime: 840,
        playbackSpeed: 1.0,
        hoverDelay: 100,
        transcodeWidth: 320
    };

    let currentHoverElement = null;
    let currentVideo = null;
    let token = null;
    let hoverTimeout = null;

    const previewOverlay = document.createElement("div");
    previewOverlay.id = "preview-overlay";
    previewOverlay.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        z-index: 100;
        display: none;
        pointer-events: none;
    `;

    const previewVideo = document.createElement("video");
    previewVideo.muted = true;
    previewVideo.controls = false;
    previewVideo.style.cssText = `
        width: 100%;
        height: 100%;
        object-fit: contain;
        pointer-events: none;
    `;
    previewOverlay.appendChild(previewVideo);
    document.body.appendChild(previewOverlay);

    const getCredentials = () => {
        const creds = localStorage.getItem("jellyfin_credentials");
        if (!creds) return null;
        try {
            const parsed = JSON.parse(creds);
            const server = parsed.Servers[0];
            return { token: server.AccessToken, userId: server.UserId };
        } catch {
            return null;
        }
    };

    const clearPreview = () => {
        if (hoverTimeout) {
            clearTimeout(hoverTimeout);
            hoverTimeout = null;
        }
        previewVideo.src = "";
        previewVideo.style.display = "none";
        previewOverlay.style.display = "none";
        if (currentVideo) {
            currentVideo.pause();
            currentVideo = null;
        }
        currentHoverElement = null;
    };

    const getFirstEpisodeId = async (itemId, itemType) => {
        try {
            const domain = window.location.origin;
            let seasonId = itemId;
            if (itemType === "Series") {
                const seasonsResp = await fetch(`${domain}/Shows/${itemId}/Seasons?api_key=${token}`);
                if (!seasonsResp.ok) {
                    console.warn(`Failed to fetch seasons for series ${itemId}: ${seasonsResp.status}`);
                    return null;
                }
                const seasons = await seasonsResp.json();
                const firstSeason = seasons.Items.find(s => s.IndexNumber === 1) || seasons.Items[0];
                if (!firstSeason) {
                    console.warn(`No seasons found for series ${itemId}`);
                    return null;
                }
                seasonId = firstSeason.Id;
            }
            const episodesResp = await fetch(`${domain}/Shows/${itemId}/Episodes?seasonId=${seasonId}&api_key=${token}`);
            if (!episodesResp.ok) {
                console.warn(`Failed to fetch episodes for season ${seasonId}: ${episodesResp.status}`);
                return null;
            }
            const episodes = await episodesResp.json();
            const firstEpisode = episodes.Items.find(e => e.IndexNumber === 1) || episodes.Items[0];
            if (!firstEpisode) {
                console.warn(`No episodes found for season ${seasonId}`);
                return null;
            }
            return firstEpisode.Id;
        } catch (e) {
            console.error(`Error fetching first episode for item ${itemId}:`, e);
            return null;
        }
    };

    const playPreview = async (itemId, container) => {
        clearPreview();
        try {
            const domain = window.location.origin;
            const rect = container.getBoundingClientRect();
            previewOverlay.style.width = `${rect.width}px`;
            previewOverlay.style.height = `${rect.height}px`;
            previewOverlay.style.top = `${rect.top + window.scrollY}px`;
            previewOverlay.style.left = `${rect.left + window.scrollX}px`;
            const itemResp = await fetch(`${domain}/Items/${itemId}?api_key=${token}`);
            if (!itemResp.ok) {
                console.warn(`Failed to fetch item ${itemId}: ${itemResp.status}`);
                return;
            }
            const item = await itemResp.json();
            let videoId = itemId;
            if (item.Type === "Season" || item.Type === "Series") {
                videoId = await getFirstEpisodeId(itemId, item.Type);
                if (!videoId) {
                    console.warn(`No valid episode found for item ${itemId}`);
                    return;
                }
            }
            const startTimeTicks = config.previewStartTime * 10000000;
            let videoUrl = `${domain}/Videos/${videoId}/stream?static=true&api_key=${token}&StartTimeTicks=${startTimeTicks}`;
            console.debug(`Attempting direct playback for item ${videoId}: ${videoUrl}`);
            previewVideo.src = videoUrl;
            previewVideo.playbackRate = config.playbackSpeed;
            previewVideo.style.display = "block";
            previewOverlay.style.display = "block";
            currentVideo = previewVideo;
            try {
                await previewVideo.play();
                if (config.previewStartTime > 0) {
                    previewVideo.currentTime = config.previewStartTime;
                }
                return;
            } catch (e) {
                console.warn(`Direct playback failed for item ${videoId}:`, e);
            }
            const transcodeHeight = Math.round(config.transcodeWidth * 9 / 16);
            videoUrl = `${domain}/Videos/${videoId}/stream.mp4?api_key=${token}&VideoCodec=h264&AudioCodec=aac&Width=${config.transcodeWidth}&Height=${transcodeHeight}&StartTimeTicks=${startTimeTicks}`;
            console.debug(`Falling back to transcoded video for item ${videoId}: ${videoUrl}`);
            previewVideo.src = videoUrl;
            previewVideo.playbackRate = config.playbackSpeed;
            previewVideo.style.display = "block";
            previewOverlay.style.display = "block";
            currentVideo = previewVideo;
            await previewVideo.play();
            if (config.previewStartTime > 0) {
                previewVideo.currentTime = config.previewStartTime;
            }
        } catch (e) {
            console.error(`Error playing preview for item ${itemId}:`, e);
            clearPreview();
        }
    };

    const attachHoverListeners = (container) => {
        const isListItemImage = container.classList.contains('listItemImage');
        let itemId;
        let hoverTarget = container;
        if (isListItemImage) {
            const parentListItem = container.closest('.listItem.listItem-largeImage.listItem-withContentWrapper');
            if (!parentListItem) {
                console.warn(`No parent listItem found for container`, container);
                return;
            }
            itemId = parentListItem.getAttribute('data-id');
            hoverTarget = parentListItem;
        } else {
            itemId = container.querySelector('button[data-id]')?.getAttribute('data-id');
        }
        if (!itemId) {
            console.warn(`No itemId found for container`, container);
            return;
        }
        const handleMouseEnter = () => {
            if (currentHoverElement !== hoverTarget) {
                clearPreview();
                currentHoverElement = hoverTarget;
                hoverTimeout = setTimeout(() => playPreview(itemId, container), config.hoverDelay);
            }
        };
        const handleMouseLeave = () => {
            if (currentHoverElement === hoverTarget) {
                clearPreview();
            }
        };
        hoverTarget.addEventListener("mouseenter", handleMouseEnter);
        hoverTarget.addEventListener("mouseleave", handleMouseLeave);
        hoverTarget.dataset.listenerAttached = 'true';
    };

    const observeCards = () => {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                if (mutation.addedNodes.length) {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const cards = node.matches('.cardOverlayContainer, .listItemImage.listItemImage-large.itemAction')
                                ? [node]
                                : node.querySelectorAll('.cardOverlayContainer, .listItemImage.listItemImage-large.itemAction');
                            cards.forEach(card => {
                                if (!card.dataset.listenerAttached) {
                                    attachHoverListeners(card);
                                }
                            });
                        }
                    });
                }
            });
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        document.querySelectorAll('.cardOverlayContainer:not([data-listener-attached]), .listItemImage.listItemImage-large.itemAction:not([data-listener-attached])').forEach(card => {
            attachHoverListeners(card);
        });
    };

    const isElementVisible = (element) => {
        if (!element) return false;
        const style = window.getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden' && element.offsetParent !== null;
    };

    const observePageMutations = () => {
        const observer = new MutationObserver((mutations) => {
            if (!currentVideo || previewOverlay.style.display === "none") return;

            if (currentHoverElement && (!document.body.contains(currentHoverElement) || !isElementVisible(currentHoverElement))) {
                console.debug("Current hover element removed or hidden, clearing preview");
                clearPreview();
                return;
            }

            if (!isElementVisible(previewOverlay)) {
                console.debug("Preview overlay hidden, clearing preview");
                clearPreview();
                return;
            }

            let totalNodes = document.body.getElementsByTagName('*').length;
            let changedNodes = 0;
            mutations.forEach(mutation => {
                changedNodes += mutation.addedNodes.length + mutation.removedNodes.length;
            });
            if (totalNodes > 0 && (changedNodes / totalNodes) > 0.006) {
                console.debug(`Significant page mutation detected (${(changedNodes / totalNodes * 100).toFixed(2)}% change), clearing preview`);
                clearPreview();
            }
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style', 'class']
        });
    };

    const handleNavigation = () => {
        console.debug("Navigation event detected, clearing preview");
        clearPreview();
    };

    const handleClick = () => {
        if (currentVideo && previewOverlay.style.display !== "none") {
            clearPreview();
        }
    };

    const observeNavigation = () => {
        let lastUrl = location.href;
        const checkUrlChange = () => {
            if (location.href !== lastUrl) {
                console.debug("URL change detected, clearing preview");
                clearPreview();
                lastUrl = location.href;
            }
        };
        setInterval(checkUrlChange, 100);
        window.addEventListener('popstate', handleNavigation);
        window.addEventListener('hashchange', handleNavigation);
        window.addEventListener('beforeunload', clearPreview);
    };

    const checkPreviewVisibility = () => {
        setInterval(() => {
            if (currentVideo && previewOverlay.style.display !== "none" && !isElementVisible(previewOverlay)) {
                console.debug("Preview overlay no longer visible, clearing preview");
                clearPreview();
            }
        }, 500);
    };

    const creds = getCredentials();
    if (!creds) {
        console.error("Jellyfin credentials not found");
        return;
    }
    token = creds.token;
    console.log("Script initialized");
    observeNavigation();
    window.addEventListener('click', handleClick);
    observeCards();
    observePageMutations();
    checkPreviewVisibility();
})();
