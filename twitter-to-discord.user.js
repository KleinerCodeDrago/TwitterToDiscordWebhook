// ==UserScript==
// @name         Twitter to Discord Webhook
// @namespace    http://tampermonkey.net/
// @version      1.1.3
// @description  Automatically post your tweets to Discord via webhook
// @author       You
// @match        https://twitter.com/*
// @match        https://x.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=twitter.com
// @updateURL    https://github.com/KleinerCodeDrago/TwitterToDiscordWebhook/raw/refs/heads/master/twitter-to-discord.user.js
// @downloadURL  https://github.com/KleinerCodeDrago/TwitterToDiscordWebhook/raw/refs/heads/master/twitter-to-discord.user.js
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @connect      discord.com
// @connect      discordapp.com
// ==/UserScript==

(function() {
    'use strict';

    // Configuration - Multi-account support
    let accountConfigs = GM_getValue('accountConfigs', {});
    let currentAccountName = null; // Will be set when we detect the current user
    
    // Legacy configuration migration
    const legacyWebhookUrl = GM_getValue('discordWebhookUrl', '');
    if (legacyWebhookUrl && Object.keys(accountConfigs).length === 0) {
        // Migrate old settings to new structure
        console.log('Migrating legacy settings to multi-account structure');
        const defaultConfig = {
            enabled: GM_getValue('discordPostingEnabled', true),
            webhookUrl: legacyWebhookUrl,
            customMessage: GM_getValue('discordCustomMessage', ''),
            mediaDisplayMode: GM_getValue('mediaDisplayMode', 'separate'),
            mediaPosition: GM_getValue('mediaPosition', 'before'),
            footerPlatform: GM_getValue('footerPlatform', 'twitter'),
            footerLanguage: GM_getValue('footerLanguage', 'en'),
            includeReplies: GM_getValue('includeReplies', false)
        };
        accountConfigs['_default'] = defaultConfig;
        GM_setValue('accountConfigs', accountConfigs);
    }
    
    // Helper function to get current account config
    function getCurrentAccountConfig() {
        if (!currentAccountName) return null;
        return accountConfigs[currentAccountName] || null;
    }
    
    // Helper function to get config value with fallback
    function getConfigValue(key, defaultValue) {
        const config = getCurrentAccountConfig();
        if (!config) {
            // If no account config, check if we have a default config
            const defaultConfig = accountConfigs['_default'];
            return defaultConfig ? (defaultConfig[key] ?? defaultValue) : defaultValue;
        }
        return config[key] ?? defaultValue;
    }
    
    // Platform icons
    const platformIcons = {
        twitter: 'https://abs.twimg.com/icons/apple-touch-icon-192x192.png',
        x: 'https://abs.twimg.com/favicons/twitter.3.ico' // X logo
    };
    
    // Translations
    const translations = {
        en: {
            footer: {
                twitter: 'Posted from Twitter',
                x: 'Posted from X'
            },
            viewButton: 'View on Twitter →',
            additionalMedia: 'Additional Media',
            items: 'items'
        },
        de: {
            footer: {
                twitter: 'Gepostet von Twitter',
                x: 'Gepostet von X'
            },
            viewButton: 'Auf Twitter ansehen →',
            additionalMedia: 'Weitere Medien',
            items: 'Elemente'
        }
    };
    
    // Cache for current user info
    let currentUserCache = null;
    
    // Function to extract current user info
    function getCurrentUserInfo() {
        if (currentUserCache) return currentUserCache;
        
        try {
            // Method 1: Check cookies for username
            const cookies = document.cookie.split(';');
            for (const cookie of cookies) {
                if (cookie.includes('twid=')) {
                    // Twitter user ID found, but we need username
                    console.log('Found Twitter ID in cookies:', cookie);
                }
            }
            
            // Method 2: Extract from initial state in page
            const scripts = document.querySelectorAll('script');
            for (const script of scripts) {
                const text = script.textContent;
                if (text && text.includes('window.__INITIAL_STATE__')) {
                    const match = text.match(/"screen_name":"([^"]+)"/);
                    if (match) {
                        // Also try to find display name
                        const nameMatch = text.match(/"name":"([^"]+)"/);
                        currentUserCache = {
                            username: match[1],
                            displayName: nameMatch ? nameMatch[1] : match[1]
                        };
                        currentAccountName = match[1]; // Set current account name
                        console.log('Found username in initial state:', match[1], 'name:', currentUserCache.displayName);
                        return currentUserCache;
                    }
                }
            }
            
            // Method 3: Get from meta tags
            const metaUsername = document.querySelector('meta[name="twitter:creator"]');
            if (metaUsername) {
                const username = metaUsername.content.replace('@', '');
                currentUserCache = {
                    username: username,
                    displayName: username
                };
                currentAccountName = username; // Set current account name
                console.log('Found username in meta tag:', username);
                return currentUserCache;
            }
            
            // Method 4: Extract from page data
            const profileLink = document.querySelector('[data-testid="AppTabBar_Profile_Link"]');
            if (profileLink) {
                const href = profileLink.getAttribute('href');
                if (href && href !== '/') {
                    const username = href.replace('/', '');
                    currentUserCache = {
                        username: username,
                        displayName: username
                    };
                    currentAccountName = username; // Set current account name
                    console.log('Found username in profile link:', username);
                    return currentUserCache;
                }
            }
            
            // Method 5: Get from user avatar in sidebar
            const userAvatar = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"] img[alt]');
            if (userAvatar) {
                const alt = userAvatar.getAttribute('alt');
                // Alt text usually contains the display name
                const parts = alt.split('@');
                if (parts.length > 1) {
                    const username = parts[1].trim();
                    const displayName = parts[0].trim() || username;
                    currentUserCache = {
                        username: username,
                        displayName: displayName,
                        profileImage: userAvatar.src
                    };
                    currentAccountName = username; // Set current account name
                    console.log('Found from avatar - username:', username, 'displayName:', displayName);
                    return currentUserCache;
                }
            }
            
            // Method 6: Get from account switcher button
            const accountSwitcher = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
            if (accountSwitcher && !currentUserCache) {
                const textElements = accountSwitcher.querySelectorAll('span');
                if (textElements.length >= 2) {
                    const displayName = textElements[0].textContent.trim();
                    const username = textElements[1].textContent.replace('@', '').trim();
                    if (username) {
                        currentUserCache = {
                            username: username,
                            displayName: displayName || username
                        };
                        currentAccountName = username; // Set current account name
                        console.log('Found from account switcher text - username:', username, 'displayName:', displayName);
                        return currentUserCache;
                    }
                }
            }
            
            // Method 7: Get from account menu
            const accountMenu = document.querySelector('[aria-label*="Account menu"]');
            if (accountMenu && !currentUserCache) {
                const text = accountMenu.textContent;
                const match = text.match(/@(\w+)/);
                if (match) {
                    currentUserCache = {
                        username: match[1],
                        displayName: match[1]
                    };
                    currentAccountName = match[1]; // Set current account name
                    console.log('Found username from account menu:', match[1]);
                    return currentUserCache;
                }
            }
            
        } catch (e) {
            console.error('Error getting current user info:', e);
        }
        
        return null;
    }
    
    // Try to get user info on page load
    setTimeout(() => {
        getCurrentUserInfo();
    }, 2000);

    // Intercept XMLHttpRequest to detect tweet posts
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url) {
        this._url = url;
        this._method = method;
        return originalOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function(data) {
        const xhr = this;
        
        // Check if this is a CreateTweet request
        if (xhr._method === 'POST' && xhr._url.includes('/graphql/') && xhr._url.includes('CreateTweet')) {
            // Store the request data
            xhr._requestData = data;
            
            // Add event listener for successful response
            xhr.addEventListener('load', function() {
                if (xhr.status === 200) {
                    try {
                        const response = JSON.parse(xhr.responseText);
                        const requestData = JSON.parse(xhr._requestData);
                        
                        // Extract tweet data
                        const tweetData = parseTweetData(response, requestData);
                        if (tweetData) {
                            // Check if this is a reply
                            const isReply = requestData?.variables?.reply?.in_reply_to_tweet_id || 
                                          requestData?.variables?.in_reply_to_status_id ||
                                          requestData?.variables?.reply_to_tweet_id ||
                                          false;
                            
                            // Get account config
                            const accountConfig = getCurrentAccountConfig();
                            
                            // Check if account is configured and enabled
                            if (!accountConfig || !accountConfig.enabled) {
                                console.log('Discord posting disabled or not configured for account:', currentAccountName);
                                return;
                            }
                            
                            // Check reply settings
                            const shouldIncludeReplies = accountConfig.includeReplies ?? false;
                            
                            // Only send to Discord if includeReplies is true or if it's not a reply
                            if (shouldIncludeReplies || !isReply) {
                                sendToDiscord(tweetData);
                            } else {
                                console.log('Skipping reply tweet - includeReplies is disabled for account:', currentAccountName);
                            }
                        }
                    } catch (e) {
                        console.error('Error parsing tweet data:', e);
                    }
                }
            });
        }
        
        return originalSend.apply(this, arguments);
    };

    // Parse tweet data from the response
    function parseTweetData(response, requestData) {
        try {
            console.log('Parsing tweet response:', response);
            
            // Navigate through the response structure
            const result = response?.data?.create_tweet?.tweet_results?.result;
            if (!result) {
                console.error('No result found in response');
                return null;
            }

            const legacy = result.legacy || result;
            const tweetId = result.rest_id || legacy.id_str;
            let text = legacy.full_text || legacy.text || '';
            
            // Get user data - check multiple possible locations
            let user = {};
            let username = 'unknown';
            let displayName = 'unknown';
            let profileImage = '';

            // Debug: Log the entire result structure
            console.log('Tweet result structure:', JSON.stringify(result, null, 2));
            
            // Try to find user data in different possible locations
            if (result.core?.user_results?.result?.legacy) {
                user = result.core.user_results.result.legacy;
                console.log('Found user in core.user_results');
            } else if (response?.data?.create_tweet?.tweet_results?.result?.user_results?.result?.legacy) {
                user = response.data.create_tweet.tweet_results.result.user_results.result.legacy;
                console.log('Found user in create_tweet.tweet_results');
            } else if (result.author_user_results?.result?.legacy) {
                user = result.author_user_results.result.legacy;
                console.log('Found user in author_user_results');
            } else {
                // Try to extract from request data
                console.log('Request data:', requestData);
                try {
                    const reqData = JSON.parse(requestData);
                    console.log('Parsed request data:', reqData);
                    
                    // Check if variables contain user info
                    if (reqData.variables?.tweet_text) {
                        console.log('Tweet text from request:', reqData.variables.tweet_text);
                    }
                } catch (e) {
                    console.error('Could not parse request data');
                }
                
                // Last resort: try to get from the tweet creation result
                if (response?.data?.create_tweet?.tweet_results?.result) {
                    const tweetResult = response.data.create_tweet.tweet_results.result;
                    console.log('Full tweet result:', JSON.stringify(tweetResult, null, 2));
                    
                    // Sometimes user data is in the root of the result
                    if (tweetResult.user_results?.result?.legacy) {
                        user = tweetResult.user_results.result.legacy;
                        console.log('Found user in tweet result root');
                    }
                }
            }

            // Extract user details
            username = user.screen_name || username;
            displayName = user.name || displayName;
            profileImage = user.profile_image_url_https || user.profile_image_url || '';

            // If we still don't have username or displayName, use cached user info
            if (username === 'unknown' || displayName === 'unknown' || displayName === username) {
                const cachedUser = getCurrentUserInfo();
                if (cachedUser) {
                    username = cachedUser.username || username;
                    displayName = cachedUser.displayName || displayName;
                    if (!profileImage && cachedUser.profileImage) {
                        profileImage = cachedUser.profileImage;
                    }
                    console.log('Using cached user info - username:', username, 'displayName:', displayName);
                }
            }
            
            // If we still don't have username, try to get it from the current page
            if (username === 'unknown') {
                try {
                    // Method 1: Try to get username from the page URL
                    const urlMatch = window.location.pathname.match(/^\/([^\/]+)/);
                    if (urlMatch && urlMatch[1] !== 'home' && urlMatch[1] !== 'compose') {
                        username = urlMatch[1];
                        console.log('Got username from URL:', username);
                    }
                    
                    // Method 2: Try to get it from the navigation profile link
                    const profileLink = document.querySelector('a[href^="/"][href$="/"][data-testid="AppTabBar_Profile_Link"]');
                    if (profileLink && username === 'unknown') {
                        const href = profileLink.getAttribute('href');
                        username = href.replace(/\//g, '') || username;
                        console.log('Got username from profile link:', username);
                    }
                    
                    // Method 3: Try to get from localStorage
                    if (username === 'unknown') {
                        const localStorageKeys = Object.keys(localStorage);
                        for (const key of localStorageKeys) {
                            if (key.includes('screen_name') || key.includes('username')) {
                                try {
                                    const value = localStorage.getItem(key);
                                    const parsed = JSON.parse(value);
                                    if (parsed.screen_name) {
                                        username = parsed.screen_name;
                                        console.log('Got username from localStorage:', username);
                                        break;
                                    }
                                } catch (e) {
                                    // Not JSON or doesn't have screen_name
                                }
                            }
                        }
                    }
                    
                    // Method 4: Try to get from React props
                    if (username === 'unknown') {
                        const reactRoot = document.querySelector('#react-root');
                        if (reactRoot && reactRoot._reactRootContainer) {
                            try {
                                const fiber = reactRoot._reactRootContainer._internalRoot.current;
                                let node = fiber;
                                while (node) {
                                    if (node.memoizedProps?.user?.screen_name) {
                                        username = node.memoizedProps.user.screen_name;
                                        console.log('Got username from React props:', username);
                                        break;
                                    }
                                    node = node.child || node.sibling || node.return;
                                }
                            } catch (e) {
                                console.error('Could not extract from React:', e);
                            }
                        }
                    }
                } catch (e) {
                    console.error('Error getting username from page:', e);
                }
            }

            // Get media URLs - handle all types (photos, GIFs, videos)
            const media = legacy.extended_entities?.media || legacy.entities?.media || [];
            console.log('Found media items:', media.length, media.map(m => ({ type: m.type, url: m.media_url_https || m.video_info })));
            
            const mediaItems = [];
            
            for (const item of media) {
                if (item.type === 'photo') {
                    mediaItems.push({
                        type: 'photo',
                        url: item.media_url_https || item.media_url,
                        thumb: item.media_url_https || item.media_url
                    });
                } else if (item.type === 'animated_gif') {
                    // For GIFs, get the MP4 variant and use preview image
                    const variants = item.video_info?.variants || [];
                    const mp4Variant = variants.find(v => v.content_type === 'video/mp4') || variants[0];
                    const thumbUrl = item.media_url_https || item.media_url || item.thumb_url;
                    
                    console.log('GIF item:', { 
                        variants: variants.length, 
                        thumb: thumbUrl,
                        preview: item.preview_image_url
                    });
                    
                    if (mp4Variant) {
                        mediaItems.push({
                            type: 'gif',
                            url: mp4Variant.url,
                            thumb: thumbUrl + ':small' // Twitter serves different sizes with :small, :medium, :large
                        });
                    }
                } else if (item.type === 'video') {
                    // For videos, get the highest quality MP4 and preview
                    const variants = item.video_info?.variants || [];
                    const mp4Variants = variants.filter(v => v.content_type === 'video/mp4');
                    const bestVariant = mp4Variants.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
                    const thumbUrl = item.media_url_https || item.media_url || item.preview_image_url;
                    
                    console.log('Video item:', { 
                        variants: variants.length, 
                        thumb: thumbUrl,
                        preview: item.preview_image_url
                    });
                    
                    if (bestVariant) {
                        mediaItems.push({
                            type: 'video',
                            url: bestVariant.url,
                            thumb: thumbUrl + ':small'
                        });
                    }
                }
            }
            
            // Remove media URLs from tweet text
            // Twitter appends t.co URLs for media at the end of tweets
            if (mediaItems.length > 0 && legacy.entities?.urls) {
                // Get all URLs from entities
                const urls = legacy.entities.urls || [];
                
                // Sort URLs by their position in reverse order (process from end to start)
                const sortedUrls = [...urls].sort((a, b) => b.indices[0] - a.indices[0]);
                
                for (const urlEntity of sortedUrls) {
                    // Check if this URL is at the end of the text (typical for media URLs)
                    // Media URLs are usually the last URLs in the tweet
                    const [start, end] = urlEntity.indices;
                    
                    // Check if the URL is at or near the end of the text
                    if (end >= text.length - 1 || (end >= text.length - 2 && text[text.length - 1] === ' ')) {
                        // This is likely a media URL, remove it
                        text = text.substring(0, start).trimEnd();
                    }
                }
            }
            
            // Also handle the case where media URLs might be plain t.co links at the end
            // This regex removes trailing t.co links that are typical for media
            if (mediaItems.length > 0) {
                text = text.replace(/\s*https:\/\/t\.co\/\w+\s*$/g, '').trimEnd();
            }

            // Construct tweet URL
            const tweetUrl = `https://twitter.com/${username}/status/${tweetId}`;

            return {
                id: tweetId,
                text: text,
                url: tweetUrl,
                username: username,
                displayName: displayName,
                profileImage: profileImage,
                media: mediaItems,
                timestamp: new Date().toISOString()
            };
        } catch (e) {
            console.error('Error extracting tweet data:', e);
            return null;
        }
    }

    // Send tweet data to Discord webhook
    function sendToDiscord(tweetData) {
        // Get account config
        const accountConfig = getCurrentAccountConfig();
        if (!accountConfig || !accountConfig.webhookUrl) {
            console.error('No webhook URL configured for account:', currentAccountName);
            return;
        }
        
        // Process custom message if set
        let messageContent = '';
        if (accountConfig.customMessage) {
            messageContent = accountConfig.customMessage
                .replace('{url}', tweetData.url)
                .replace('{username}', tweetData.username)
                .replace('{date}', new Date().toLocaleDateString());
        }
        
        const embed = {
            author: {
                name: `${tweetData.displayName} (@${tweetData.username})`,
                icon_url: tweetData.profileImage,
                url: `https://twitter.com/${tweetData.username}`
            },
            description: tweetData.text + `\n\n**[${translations[accountConfig.footerLanguage || 'en'].viewButton}](${tweetData.url})**`,
            color: 0x1DA1F2, // Twitter blue
            timestamp: tweetData.timestamp,
            footer: {
                text: translations[accountConfig.footerLanguage || 'en'].footer[accountConfig.footerPlatform || 'twitter'],
                icon_url: platformIcons[accountConfig.footerPlatform || 'twitter']
            },
            fields: []
        };

        // Check media types
        const hasGif = tweetData.media.some(m => m.type === 'gif');
        const hasVideo = tweetData.media.some(m => m.type === 'video');
        const hasMedia = tweetData.media.length > 0;
        
        // Handle media based on display mode
        if (accountConfig.mediaDisplayMode === 'embedded') {
            // In embedded mode, always show preview in embed
            if (hasMedia) {
                const firstMedia = tweetData.media[0];
                embed.image = { url: firstMedia.type === 'photo' ? firstMedia.url : firstMedia.thumb };
            }
        } else {
            // In separate mode, only show photos in embed
            if (hasMedia && !hasGif && !hasVideo) {
                const firstMedia = tweetData.media[0];
                if (firstMedia.type === 'photo') {
                    embed.image = { url: firstMedia.url };
                }
            }
        }

        // If there are multiple media items, note it
        if (tweetData.media.length > 1) {
            const mediaTypes = tweetData.media.map(m => {
                if (m.type === 'photo') return '🖼️';
                if (m.type === 'gif') return '🎬';
                if (m.type === 'video') return '🎥';
                return '📎';
            }).join(' ');
            
            embed.fields.push({
                name: translations[accountConfig.footerLanguage].additionalMedia,
                value: `${tweetData.media.length} ${translations[accountConfig.footerLanguage].items}: ${mediaTypes}`,
                inline: false
            });
        }

        // Handle separate media mode
        if (accountConfig.mediaDisplayMode === 'separate' && (hasGif || hasVideo)) {
            const animatedMedia = tweetData.media.filter(m => m.type === 'gif' || m.type === 'video');
            
            // Function to send animated media
            function sendAnimatedMedia(callback) {
                let sent = 0;
                animatedMedia.forEach((media, index) => {
                    setTimeout(() => {
                        const mediaPayload = {
                            username: 'Twitter Notifier',
                            avatar_url: platformIcons[accountConfig.footerPlatform],
                            content: media.url // The MP4 URL will be rendered as playable
                        };
                        
                        GM_xmlhttpRequest({
                            method: 'POST',
                            url: accountConfig.webhookUrl,
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            data: JSON.stringify(mediaPayload),
                            onload: function(response) {
                                sent++;
                                if (sent === animatedMedia.length && callback) {
                                    setTimeout(callback, 500);
                                }
                            },
                            onerror: function() {
                                sent++;
                                if (sent === animatedMedia.length && callback) {
                                    setTimeout(callback, 500);
                                }
                            }
                        });
                    }, index * 500);
                });
            }
            
            // Send based on position preference
            if (accountConfig.mediaPosition === 'before') {
                sendAnimatedMedia(() => sendTweetEmbed());
                return;
            } else {
                // Send tweet first, then media
                sendTweetEmbed(() => {
                    setTimeout(() => sendAnimatedMedia(), 500);
                });
                return;
            }
        }
        
        // Function to send the main tweet embed
        function sendTweetEmbed(callback) {
            const payload = {
                username: 'Twitter Notifier',
                avatar_url: platformIcons[accountConfig.footerPlatform],
                content: messageContent,
                embeds: [embed]
            };

            GM_xmlhttpRequest({
                method: 'POST',
                url: accountConfig.webhookUrl,
                headers: {
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify(payload),
                onload: function(response) {
                    if (response.status === 204) {
                        console.log('Tweet successfully sent to Discord!');
                        
                        // Call callback if provided
                        if (callback) {
                            callback();
                        }
                        
                        // If there are multiple images, send additional ones
                        if (tweetData.media.length > 1 && tweetData.media.every(m => m.type === 'photo')) {
                            // Send remaining images as separate messages
                            for (let i = 1; i < Math.min(tweetData.media.length, 4); i++) {
                                const additionalPayload = {
                                    username: 'Twitter Notifier',
                                    avatar_url: platformIcons[accountConfig.footerPlatform],
                                    content: '',
                                    embeds: [{
                                        image: { url: tweetData.media[i].url },
                                        color: 0x1DA1F2
                                    }]
                                };
                                
                                setTimeout(() => {
                                    GM_xmlhttpRequest({
                                        method: 'POST',
                                        url: accountConfig.webhookUrl,
                                        headers: {
                                            'Content-Type': 'application/json'
                                        },
                                        data: JSON.stringify(additionalPayload),
                                        onload: function(resp) {
                                            if (resp.status === 204) {
                                                console.log(`Additional image ${i} sent!`);
                                            }
                                        }
                                    });
                                }, i * 500); // Delay to avoid rate limits
                            }
                        }
                    } else {
                        console.error('Failed to send to Discord:', response.status, response.responseText);
                    }
                },
                onerror: function(error) {
                    console.error('Error sending to Discord:', error);
                }
            });
        }
        
        // Default case: send tweet embed normally
        sendTweetEmbed();
    }

    // Create settings UI
    function createSettingsUI() {
        // Get current user info first
        if (!currentAccountName) {
            getCurrentUserInfo();
        }
        
        // Get list of configured accounts
        const configuredAccounts = Object.keys(accountConfigs).filter(key => key !== '_default');
        
        // Current config (either for current account or create new)
        let selectedAccount = currentAccountName || configuredAccounts[0] || 'new';
        let currentConfig = accountConfigs[selectedAccount] || {
            enabled: true,
            webhookUrl: '',
            customMessage: '',
            mediaDisplayMode: 'separate',
            mediaPosition: 'before',
            footerPlatform: 'twitter',
            footerLanguage: 'en',
            includeReplies: false
        };
        
        // Build account selector options
        let accountOptions = '';
        if (currentAccountName && !configuredAccounts.includes(currentAccountName)) {
            accountOptions += `<option value="${currentAccountName}" selected>@${currentAccountName} (current - new config)</option>`;
        }
        configuredAccounts.forEach(account => {
            const selected = account === selectedAccount ? 'selected' : '';
            const isCurrent = account === currentAccountName ? ' (current)' : '';
            accountOptions += `<option value="${account}" ${selected}>@${account}${isCurrent}</option>`;
        });
        accountOptions += '<option value="new">+ Add new account</option>';
        
        const settingsHtml = `
            <div id="discord-webhook-settings" style="display: none;">
                <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 9998;"></div>
                <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #15202b; color: #fff; padding: 20px; border-radius: 10px; z-index: 9999; min-width: 500px; max-width: 600px; border: 1px solid #38444d;">
                    <h3 style="margin-top: 0; color: #fff;">Discord Webhook Settings</h3>
                    
                    <label style="display: block; margin-bottom: 5px; color: #fff;">Account:</label>
                    <select id="discord-account-selector" style="width: 100%; padding: 8px; margin-bottom: 15px; background: #192734; color: #fff; border: 1px solid #38444d; border-radius: 4px;">
                        ${accountOptions}
                    </select>
                    
                    <div id="discord-new-account-input" style="display: none; margin-bottom: 15px;">
                        <label style="display: block; margin-bottom: 5px; color: #fff;">New Account Username:</label>
                        <input type="text" id="discord-new-account-name" placeholder="Enter username (without @)" style="width: 100%; padding: 8px; background: #192734; color: #fff; border: 1px solid #38444d; border-radius: 4px;">
                    </div>
                    <label style="display: block; margin-bottom: 10px; color: #fff;">
                        <input type="checkbox" id="discord-enabled" ${currentConfig.enabled ? 'checked' : ''} style="margin-right: 5px;">
                        Enable Discord posting
                    </label>
                    <label style="display: block; margin-bottom: 10px; color: #fff;">
                        <input type="checkbox" id="discord-include-replies" ${currentConfig.includeReplies ? 'checked' : ''} style="margin-right: 5px;">
                        Include replies to tweets
                    </label>
                    <label style="display: block; margin-bottom: 5px; color: #fff;">Webhook URL:</label>
                    <input type="text" id="discord-webhook-url" value="${currentConfig.webhookUrl}" style="width: 100%; padding: 8px; margin-bottom: 10px; background: #192734; color: #fff; border: 1px solid #38444d; border-radius: 4px;">
                    
                    <label style="display: block; margin-bottom: 5px; color: #fff;">Custom Message (optional):</label>
                    <input type="text" id="discord-custom-message" value="${currentConfig.customMessage}" placeholder="e.g. New tweet from {username}" style="width: 100%; padding: 8px; margin-bottom: 5px; background: #192734; color: #fff; border: 1px solid #38444d; border-radius: 4px;">
                    <small style="display: block; color: #8b98a5; margin-bottom: 15px;">Available: {url}, {username}, {date}</small>
                    
                    <label style="display: block; margin-bottom: 5px; color: #fff;">Media Display:</label>
                    <select id="discord-media-mode" style="width: 100%; padding: 8px; margin-bottom: 10px; background: #192734; color: #fff; border: 1px solid #38444d; border-radius: 4px;">
                        <option value="separate" ${currentConfig.mediaDisplayMode === 'separate' ? 'selected' : ''}>Separate (playable GIFs/videos)</option>
                        <option value="embedded" ${currentConfig.mediaDisplayMode === 'embedded' ? 'selected' : ''}>Embedded (static preview)</option>
                    </select>
                    
                    <div id="media-position-container" style="${currentConfig.mediaDisplayMode === 'embedded' ? 'display: none;' : ''}">
                        <label style="display: block; margin-bottom: 5px; color: #fff;">Media Position:</label>
                        <select id="discord-media-position" style="width: 100%; padding: 8px; margin-bottom: 10px; background: #192734; color: #fff; border: 1px solid #38444d; border-radius: 4px;">
                            <option value="before" ${currentConfig.mediaPosition === 'before' ? 'selected' : ''}>Before tweet</option>
                            <option value="after" ${currentConfig.mediaPosition === 'after' ? 'selected' : ''}>After tweet</option>
                        </select>
                    </div>
                    
                    <label style="display: block; margin-bottom: 5px; color: #fff;">Footer Platform:</label>
                    <select id="discord-footer-platform" style="width: 100%; padding: 8px; margin-bottom: 10px; background: #192734; color: #fff; border: 1px solid #38444d; border-radius: 4px;">
                        <option value="twitter" ${currentConfig.footerPlatform === 'twitter' ? 'selected' : ''}>Twitter</option>
                        <option value="x" ${currentConfig.footerPlatform === 'x' ? 'selected' : ''}>X</option>
                    </select>
                    
                    <label style="display: block; margin-bottom: 5px; color: #fff;">Language:</label>
                    <select id="discord-footer-language" style="width: 100%; padding: 8px; margin-bottom: 15px; background: #192734; color: #fff; border: 1px solid #38444d; border-radius: 4px;">
                        <option value="en" ${currentConfig.footerLanguage === 'en' ? 'selected' : ''}>English</option>
                        <option value="de" ${currentConfig.footerLanguage === 'de' ? 'selected' : ''}>Deutsch</option>
                    </select>
                    
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 20px;">
                        <button id="discord-settings-delete" style="padding: 8px 20px; background: #f4212e; color: #fff; border: none; border-radius: 9999px; cursor: pointer; font-weight: bold; ${selectedAccount === 'new' ? 'display: none;' : ''}">Delete Account Config</button>
                        <div>
                            <button id="discord-settings-save" style="margin-right: 10px; padding: 8px 20px; background: #1d9bf0; color: #fff; border: none; border-radius: 9999px; cursor: pointer; font-weight: bold;">Save</button>
                            <button id="discord-settings-cancel" style="padding: 8px 20px; background: transparent; color: #fff; border: 1px solid #536471; border-radius: 9999px; cursor: pointer; font-weight: bold;">Cancel</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Add settings UI to page
        const settingsDiv = document.createElement('div');
        settingsDiv.innerHTML = settingsHtml;
        document.body.appendChild(settingsDiv);

        // Add settings button to Twitter navigation
        function addSettingsButton() {
            const nav = document.querySelector('nav[role="navigation"]');
            if (!nav || document.getElementById('discord-settings-button')) return;

            const button = document.createElement('div');
            button.id = 'discord-settings-button';
            button.style.cssText = 'cursor: pointer; padding: 12px; margin: 5px 0; border-radius: 9999px; transition: background-color 0.2s;';
            button.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" style="fill: currentColor;"><path d="M19.54 0c1.356 0 2.46 1.104 2.46 2.472v21.528l-2.58-2.28-1.452-1.344-1.536-1.428.636 2.22h-13.608c-1.356 0-2.46-1.104-2.46-2.472v-16.224c0-1.368 1.104-2.472 2.46-2.472h16.08zm-4.632 15.672c2.652-.084 3.672-1.824 3.672-1.824 0-3.864-1.728-6.996-1.728-6.996-1.728-1.296-3.372-1.26-3.372-1.26l-.168.192c2.04.624 2.988 1.524 2.988 1.524-1.248-.684-2.472-1.02-3.612-1.152-.864-.096-1.692-.072-2.424.024l-.204.024c-.42.036-1.44.192-2.724.756-.444.204-.708.348-.708.348s.996-.948 3.156-1.572l-.12-.144s-1.644-.036-3.372 1.26c0 0-1.728 3.132-1.728 6.996 0 0 1.008 1.74 3.66 1.824 0 0 .444-.54.804-.996-1.524-.456-2.1-1.416-2.1-1.416l.336.204.048.036.047.027.014.006.047.027c.3.168.6.3.876.408.492.192 1.08.384 1.764.516.9.168 1.956.228 3.108.012.564-.096 1.14-.264 1.74-.516.42-.156.888-.384 1.38-.708 0 0-.6.984-2.172 1.428.36.456.792.972.792.972zm-5.58-5.604c-.684 0-1.224.6-1.224 1.332 0 .732.552 1.332 1.224 1.332.684 0 1.224-.6 1.224-1.332.012-.732-.54-1.332-1.224-1.332zm4.38 0c-.684 0-1.224.6-1.224 1.332 0 .732.552 1.332 1.224 1.332.684 0 1.224-.6 1.224-1.332 0-.732-.54-1.332-1.224-1.332z"/></svg>';
            
            button.addEventListener('click', () => {
                // Remove old settings UI if exists
                const oldSettings = document.getElementById('discord-webhook-settings');
                if (oldSettings) {
                    oldSettings.remove();
                }
                // Recreate settings UI to ensure current account is selected
                createSettingsUI();
                document.getElementById('discord-webhook-settings').style.display = 'block';
            });

            button.addEventListener('mouseenter', () => {
                button.style.backgroundColor = 'rgba(29, 161, 242, 0.1)';
            });

            button.addEventListener('mouseleave', () => {
                button.style.backgroundColor = 'transparent';
            });

            nav.appendChild(button);
        }

        // Try to add button periodically (Twitter loads dynamically)
        const buttonInterval = setInterval(addSettingsButton, 1000);
        setTimeout(() => clearInterval(buttonInterval), 30000); // Stop after 30 seconds

        // Settings event handlers
        // Account selector change
        document.getElementById('discord-account-selector').addEventListener('change', (e) => {
            const selectedValue = e.target.value;
            const newAccountInput = document.getElementById('discord-new-account-input');
            const deleteButton = document.getElementById('discord-settings-delete');
            
            if (selectedValue === 'new') {
                newAccountInput.style.display = 'block';
                deleteButton.style.display = 'none';
                // Reset form to defaults
                document.getElementById('discord-enabled').checked = true;
                document.getElementById('discord-webhook-url').value = '';
                document.getElementById('discord-custom-message').value = '';
                document.getElementById('discord-media-mode').value = 'separate';
                document.getElementById('discord-media-position').value = 'before';
                document.getElementById('discord-footer-platform').value = 'twitter';
                document.getElementById('discord-footer-language').value = 'en';
                document.getElementById('discord-include-replies').checked = false;
            } else {
                newAccountInput.style.display = 'none';
                deleteButton.style.display = 'block';
                // Load config for selected account
                const config = accountConfigs[selectedValue] || {};
                document.getElementById('discord-enabled').checked = config.enabled ?? true;
                document.getElementById('discord-webhook-url').value = config.webhookUrl || '';
                document.getElementById('discord-custom-message').value = config.customMessage || '';
                document.getElementById('discord-media-mode').value = config.mediaDisplayMode || 'separate';
                document.getElementById('discord-media-position').value = config.mediaPosition || 'before';
                document.getElementById('discord-footer-platform').value = config.footerPlatform || 'twitter';
                document.getElementById('discord-footer-language').value = config.footerLanguage || 'en';
                document.getElementById('discord-include-replies').checked = config.includeReplies ?? false;
                
                // Update media position visibility
                const positionContainer = document.getElementById('media-position-container');
                positionContainer.style.display = config.mediaDisplayMode === 'embedded' ? 'none' : 'block';
            }
        });
        
        // Media mode change
        document.getElementById('discord-media-mode').addEventListener('change', (e) => {
            const positionContainer = document.getElementById('media-position-container');
            positionContainer.style.display = e.target.value === 'embedded' ? 'none' : 'block';
        });
        
        // Save button
        document.getElementById('discord-settings-save').addEventListener('click', () => {
            const selector = document.getElementById('discord-account-selector');
            let accountName = selector.value;
            
            // Handle new account creation
            if (accountName === 'new') {
                const newAccountName = document.getElementById('discord-new-account-name').value.trim();
                if (!newAccountName) {
                    alert('Please enter a username for the new account configuration.');
                    return;
                }
                accountName = newAccountName.replace('@', ''); // Remove @ if included
            }
            
            // Gather config values
            const config = {
                enabled: document.getElementById('discord-enabled').checked,
                webhookUrl: document.getElementById('discord-webhook-url').value,
                customMessage: document.getElementById('discord-custom-message').value,
                mediaDisplayMode: document.getElementById('discord-media-mode').value,
                mediaPosition: document.getElementById('discord-media-position').value,
                footerPlatform: document.getElementById('discord-footer-platform').value,
                footerLanguage: document.getElementById('discord-footer-language').value,
                includeReplies: document.getElementById('discord-include-replies').checked
            };
            
            // Save to accountConfigs
            accountConfigs[accountName] = config;
            GM_setValue('accountConfigs', accountConfigs);
            
            document.getElementById('discord-webhook-settings').style.display = 'none';
            
            // Update status indicator if it exists
            updateStatusIndicator();
            
            if (config.webhookUrl && config.enabled) {
                alert(`Discord webhook settings saved for @${accountName}!`);
            } else if (!config.enabled) {
                alert(`Discord posting disabled for @${accountName}.`);
            } else {
                alert(`Settings saved for @${accountName} (webhook URL required to enable posting).`);
            }
        });

        // Delete button
        document.getElementById('discord-settings-delete').addEventListener('click', () => {
            const accountName = document.getElementById('discord-account-selector').value;
            if (accountName && accountName !== 'new') {
                if (confirm(`Are you sure you want to delete the configuration for @${accountName}?`)) {
                    delete accountConfigs[accountName];
                    GM_setValue('accountConfigs', accountConfigs);
                    document.getElementById('discord-webhook-settings').style.display = 'none';
                    
                    // Update status indicator if it exists
                    updateStatusIndicator();
                    
                    alert(`Configuration for @${accountName} has been deleted.`);
                }
            }
        });
        
        // Cancel button
        document.getElementById('discord-settings-cancel').addEventListener('click', () => {
            document.getElementById('discord-webhook-settings').style.display = 'none';
        });
    }

    // Check if current compose window is a reply
    function isReplyCompose() {
        // Check for reply label in the compose modal
        const replyLabel = document.querySelector('[data-testid="reply"]');
        if (replyLabel) return true;
        
        // Check if there's a "Replying to @username" text
        const replyingTo = document.querySelector('[data-testid="caret"] ~ div span');
        if (replyingTo && replyingTo.textContent.includes('Replying to')) return true;
        
        // Check URL for reply pattern
        if (window.location.pathname.includes('/compose/tweet') && window.location.search.includes('reply')) return true;
        
        return false;
    }
    
    // Update existing status indicator
    function updateStatusIndicator() {
        const indicator = document.getElementById('discord-status-indicator');
        if (!indicator) return;
        
        // Get account config
        const config = getCurrentAccountConfig();
        const isConfigured = config && config.webhookUrl;
        const isEnabled = config && config.enabled;
        const isReply = isReplyCompose();
        const includeReplies = config && config.includeReplies;
        
        // Determine if truly active
        let isActive = isEnabled && isConfigured;
        if (isReply && !includeReplies) {
            isActive = false;
        }
        
        // Update background
        indicator.style.background = isActive ? 'rgba(29, 155, 240, 0.1)' : 'rgba(113, 118, 123, 0.1)';
        
        // Update icon color
        const icon = indicator.querySelector('svg');
        if (icon) {
            icon.style.fill = isActive ? '#1d9bf0' : '#71767b';
        }
        
        // Update status text
        const statusText = indicator.querySelector('span');
        if (statusText) {
            statusText.style.color = isActive ? '#1d9bf0' : '#71767b';
            if (isReply && isEnabled && isConfigured && !includeReplies) {
                statusText.textContent = 'Replies disabled';
            } else {
                statusText.textContent = isActive ? 'Active' : (!isConfigured ? 'Not configured' : 'Disabled');
            }
        }
        
        // Update tooltip
        let tooltipText = '';
        if (isReply && isEnabled && isConfigured && !includeReplies) {
            tooltipText = `Discord webhook disabled for replies - @${currentAccountName || 'unknown'}`;
        } else {
            tooltipText = `Discord webhook ${isActive ? 'active' : (!isConfigured ? 'not configured' : 'disabled')} for @${currentAccountName || 'unknown'}`;
        }
        indicator.title = tooltipText;
    }
    
    // Visual status indicator for tweet compose window
    function addStatusIndicator() {
        // Check if we have current account name
        if (!currentAccountName) {
            getCurrentUserInfo();
        }
        
        // Find tweet button
        const tweetButton = document.querySelector('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]');
        if (!tweetButton || document.getElementById('discord-status-indicator')) return;
        
        // Get account config
        const config = getCurrentAccountConfig();
        const isConfigured = config && config.webhookUrl;
        const isEnabled = config && config.enabled;
        const isReply = isReplyCompose();
        const includeReplies = config && config.includeReplies;
        
        // Determine if truly active
        let isActive = isEnabled && isConfigured;
        if (isReply && !includeReplies) {
            isActive = false;
        }
        
        // Create status indicator
        const indicator = document.createElement('div');
        indicator.id = 'discord-status-indicator';
        indicator.style.cssText = `
            display: inline-flex;
            align-items: center;
            margin-right: 12px;
            padding: 4px 8px;
            background: ${isActive ? 'rgba(29, 155, 240, 0.1)' : 'rgba(113, 118, 123, 0.1)'};
            border-radius: 9999px;
            cursor: pointer;
        `;
        
        // Create Discord icon
        const icon = document.createElement('div');
        icon.style.cssText = 'width: 20px; height: 20px; margin-right: 6px;';
        icon.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" style="fill: ${isActive ? '#1d9bf0' : '#71767b'};"><path d="M19.54 0c1.356 0 2.46 1.104 2.46 2.472v21.528l-2.58-2.28-1.452-1.344-1.536-1.428.636 2.22h-13.608c-1.356 0-2.46-1.104-2.46-2.472v-16.224c0-1.368 1.104-2.472 2.46-2.472h16.08zm-4.632 15.672c2.652-.084 3.672-1.824 3.672-1.824 0-3.864-1.728-6.996-1.728-6.996-1.728-1.296-3.372-1.26-3.372-1.26l-.168.192c2.04.624 2.988 1.524 2.988 1.524-1.248-.684-2.472-1.02-3.612-1.152-.864-.096-1.692-.072-2.424.024l-.204.024c-.42.036-1.44.192-2.724.756-.444.204-.708.348-.708.348s.996-.948 3.156-1.572l-.12-.144s-1.644-.036-3.372 1.26c0 0-1.728 3.132-1.728 6.996 0 0 1.008 1.74 3.66 1.824 0 0 .444-.54.804-.996-1.524-.456-2.1-1.416-2.1-1.416l.336.204.048.036.047.027.014.006.047.027c.3.168.6.3.876.408.492.192 1.08.384 1.764.516.9.168 1.956.228 3.108.012.564-.096 1.14-.264 1.74-.516.42-.156.888-.384 1.38-.708 0 0-.6.984-2.172 1.428.36.456.792.972.792.972zm-5.58-5.604c-.684 0-1.224.6-1.224 1.332 0 .732.552 1.332 1.224 1.332.684 0 1.224-.6 1.224-1.332.012-.732-.54-1.332-1.224-1.332zm4.38 0c-.684 0-1.224.6-1.224 1.332 0 .732.552 1.332 1.224 1.332.684 0 1.224-.6 1.224-1.332 0-.732-.54-1.332-1.224-1.332z"/></svg>`;
        
        // Create status text
        const statusText = document.createElement('span');
        statusText.style.cssText = `font-size: 13px; color: ${isActive ? '#1d9bf0' : '#71767b'}; font-weight: 500;`;
        if (isReply && isEnabled && isConfigured && !includeReplies) {
            statusText.textContent = 'Replies disabled';
        } else {
            statusText.textContent = isActive ? 'Active' : (!isConfigured ? 'Not configured' : 'Disabled');
        }
        
        indicator.appendChild(icon);
        indicator.appendChild(statusText);
        
        // Add tooltip
        let tooltipText = '';
        if (isReply && isEnabled && isConfigured && !includeReplies) {
            tooltipText = `Discord webhook disabled for replies - @${currentAccountName || 'unknown'}`;
        } else {
            tooltipText = `Discord webhook ${isActive ? 'active' : (!isConfigured ? 'not configured' : 'disabled')} for @${currentAccountName || 'unknown'}`;
        }
        indicator.title = tooltipText;
        
        // Add click handler to open settings
        indicator.addEventListener('click', (e) => {
            e.stopPropagation();
            // Remove old settings UI if exists
            const oldSettings = document.getElementById('discord-webhook-settings');
            if (oldSettings) {
                oldSettings.remove();
            }
            // Recreate settings UI to ensure current account is selected
            createSettingsUI();
            document.getElementById('discord-webhook-settings').style.display = 'block';
        });
        
        // Insert before tweet button
        tweetButton.parentElement.insertBefore(indicator, tweetButton);
    }
    
    // Monitor for tweet compose window
    const composeObserver = new MutationObserver(() => {
        const tweetTextarea = document.querySelector('[data-testid="tweetTextarea_0"], [data-testid="tweetTextarea"]');
        if (tweetTextarea) {
            addStatusIndicator();
        }
    });
    
    composeObserver.observe(document.body, { 
        childList: true, 
        subtree: true 
    });
    
    // Initialize the script
    createSettingsUI();
    
    console.log('Twitter to Discord Webhook userscript loaded!');
})();