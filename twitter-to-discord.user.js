// ==UserScript==
// @name         Twitter to Discord Webhook
// @namespace    http://tampermonkey.net/
// @version      1.0.5
// @description  Automatically post your tweets to Discord via webhook
// @author       You
// @match        https://twitter.com/*
// @match        https://x.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=twitter.com
// @updateURL    https://git.katzenzungen.lol/ForgoAdmin/Twitter-to-discord/raw/branch/master/twitter-to-discord.user.js
// @downloadURL  https://git.katzenzungen.lol/ForgoAdmin/Twitter-to-discord/raw/branch/master/twitter-to-discord.user.js
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @connect      discord.com
// @connect      discordapp.com
// ==/UserScript==

(function() {
    'use strict';

    // Configuration
    let webhookUrl = GM_getValue('discordWebhookUrl', '');
    let isEnabled = GM_getValue('discordPostingEnabled', true);
    let customMessage = GM_getValue('discordCustomMessage', '');
    
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
                        currentUserCache = {
                            username: match[1],
                            displayName: match[1]
                        };
                        console.log('Found username in initial state:', match[1]);
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
                    console.log('Found username in profile link:', username);
                    return currentUserCache;
                }
            }
            
            // Method 5: Get from user avatar in sidebar
            const userAvatar = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"] img[alt]');
            if (userAvatar) {
                const alt = userAvatar.getAttribute('alt');
                const match = alt.match(/@(\w+)/);
                if (match) {
                    currentUserCache = {
                        username: match[1],
                        displayName: match[1],
                        profileImage: userAvatar.src
                    };
                    console.log('Found username from avatar alt:', match[1]);
                    return currentUserCache;
                }
            }
            
            // Method 6: Get from account menu
            const accountMenu = document.querySelector('[aria-label*="Account menu"]');
            if (accountMenu) {
                const text = accountMenu.textContent;
                const match = text.match(/@(\w+)/);
                if (match) {
                    currentUserCache = {
                        username: match[1],
                        displayName: match[1]
                    };
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
                if (xhr.status === 200 && isEnabled && webhookUrl) {
                    try {
                        const response = JSON.parse(xhr.responseText);
                        const requestData = JSON.parse(xhr._requestData);
                        
                        // Extract tweet data
                        const tweetData = parseTweetData(response, requestData);
                        if (tweetData) {
                            sendToDiscord(tweetData);
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
            const text = legacy.full_text || legacy.text || '';
            
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

            // If we still don't have username, use cached user info
            if (username === 'unknown') {
                const cachedUser = getCurrentUserInfo();
                if (cachedUser) {
                    username = cachedUser.username;
                    displayName = cachedUser.displayName || username;
                    console.log('Using cached user info:', username);
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
        // Process custom message if set
        let messageContent = '';
        if (customMessage) {
            messageContent = customMessage
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
            description: tweetData.text + `\n\n**[View on Twitter →](${tweetData.url})**`,
            color: 0x1DA1F2, // Twitter blue
            timestamp: tweetData.timestamp,
            footer: {
                text: 'Posted from Twitter',
                icon_url: 'https://abs.twimg.com/icons/apple-touch-icon-192x192.png'
            }
        };

        // Check if we have a GIF that should be sent separately
        const hasGif = tweetData.media.some(m => m.type === 'gif');
        const hasVideo = tweetData.media.some(m => m.type === 'video');
        
        // For regular photos or videos, add to embed
        if (!hasGif && tweetData.media.length > 0) {
            const firstMedia = tweetData.media[0];
            embed.image = { url: firstMedia.type === 'video' ? firstMedia.thumb : firstMedia.url };
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
                name: 'Additional Media',
                value: `${tweetData.media.length} items: ${mediaTypes}`,
                inline: false
            });
        }

        // If we have a GIF, send it first as a separate message
        if (hasGif) {
            const gifMedia = tweetData.media.find(m => m.type === 'gif');
            if (gifMedia) {
                const gifPayload = {
                    username: 'Twitter Notifier',
                    avatar_url: 'https://abs.twimg.com/icons/apple-touch-icon-192x192.png',
                    content: gifMedia.url // The MP4 URL will be rendered as a playable GIF
                };
                
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: webhookUrl,
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    data: JSON.stringify(gifPayload),
                    onload: function(response) {
                        if (response.status === 204) {
                            console.log('GIF sent successfully!');
                            // Send the tweet embed after a short delay
                            setTimeout(() => {
                                sendTweetEmbed();
                            }, 500);
                        } else {
                            console.error('Failed to send GIF:', response.status);
                            // Try to send embed anyway
                            sendTweetEmbed();
                        }
                    },
                    onerror: function(error) {
                        console.error('Error sending GIF:', error);
                        // Try to send embed anyway
                        sendTweetEmbed();
                    }
                });
                return; // Exit early, sendTweetEmbed will handle the rest
            }
        }
        
        // Function to send the main tweet embed
        function sendTweetEmbed() {
            const payload = {
                username: 'Twitter Notifier',
                avatar_url: 'https://abs.twimg.com/icons/apple-touch-icon-192x192.png',
                content: messageContent,
                embeds: [embed]
            };

            GM_xmlhttpRequest({
                method: 'POST',
                url: webhookUrl,
                headers: {
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify(payload),
                onload: function(response) {
                    if (response.status === 204) {
                        console.log('Tweet successfully sent to Discord!');
                        
                        // If there are multiple images, send additional ones
                        if (tweetData.media.length > 1 && tweetData.media.every(m => m.type === 'photo')) {
                            // Send remaining images as separate messages
                            for (let i = 1; i < Math.min(tweetData.media.length, 4); i++) {
                                const additionalPayload = {
                                    username: 'Twitter Notifier',
                                    avatar_url: 'https://abs.twimg.com/icons/apple-touch-icon-192x192.png',
                                    content: '',
                                    embeds: [{
                                        image: { url: tweetData.media[i].url },
                                        color: 0x1DA1F2
                                    }]
                                };
                                
                                setTimeout(() => {
                                    GM_xmlhttpRequest({
                                        method: 'POST',
                                        url: webhookUrl,
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
        
        // If no GIF, send normally
        if (!hasGif) {
            sendTweetEmbed();
        }
    }

    // Create settings UI
    function createSettingsUI() {
        const settingsHtml = `
            <div id="discord-webhook-settings" style="display: none;">
                <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 9998;"></div>
                <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #15202b; color: #fff; padding: 20px; border-radius: 10px; z-index: 9999; min-width: 400px; border: 1px solid #38444d;">
                    <h3 style="margin-top: 0; color: #fff;">Discord Webhook Settings</h3>
                    <label style="display: block; margin-bottom: 10px; color: #fff;">
                        <input type="checkbox" id="discord-enabled" ${isEnabled ? 'checked' : ''} style="margin-right: 5px;">
                        Enable Discord posting
                    </label>
                    <label style="display: block; margin-bottom: 5px; color: #fff;">Webhook URL:</label>
                    <input type="text" id="discord-webhook-url" value="${webhookUrl}" style="width: 100%; padding: 8px; margin-bottom: 10px; background: #192734; color: #fff; border: 1px solid #38444d; border-radius: 4px;">
                    
                    <label style="display: block; margin-bottom: 5px; color: #fff;">Custom Message (optional):</label>
                    <input type="text" id="discord-custom-message" value="${customMessage}" placeholder="e.g. New tweet from {username}" style="width: 100%; padding: 8px; margin-bottom: 5px; background: #192734; color: #fff; border: 1px solid #38444d; border-radius: 4px;">
                    <small style="display: block; color: #8b98a5; margin-bottom: 15px;">Available: {url}, {username}, {date}</small>
                    
                    <div style="text-align: right;">
                        <button id="discord-settings-save" style="margin-right: 10px; padding: 8px 20px; background: #1d9bf0; color: #fff; border: none; border-radius: 9999px; cursor: pointer; font-weight: bold;">Save</button>
                        <button id="discord-settings-cancel" style="padding: 8px 20px; background: transparent; color: #fff; border: 1px solid #536471; border-radius: 9999px; cursor: pointer; font-weight: bold;">Cancel</button>
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
        document.getElementById('discord-settings-save').addEventListener('click', () => {
            webhookUrl = document.getElementById('discord-webhook-url').value;
            isEnabled = document.getElementById('discord-enabled').checked;
            customMessage = document.getElementById('discord-custom-message').value;
            
            GM_setValue('discordWebhookUrl', webhookUrl);
            GM_setValue('discordPostingEnabled', isEnabled);
            GM_setValue('discordCustomMessage', customMessage);
            
            document.getElementById('discord-webhook-settings').style.display = 'none';
            
            if (webhookUrl && isEnabled) {
                alert('Discord webhook settings saved! Your tweets will now be posted to Discord.');
            }
        });

        document.getElementById('discord-settings-cancel').addEventListener('click', () => {
            document.getElementById('discord-webhook-settings').style.display = 'none';
        });
    }

    // Initialize the script
    createSettingsUI();
    
    console.log('Twitter to Discord Webhook userscript loaded!');
})();