// ==UserScript==
// @name         Twitter to Discord Webhook
// @namespace    http://tampermonkey.net/
// @version      1.0.1
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
                } catch (e) {
                    console.error('Could not parse request data');
                }
            }

            // Extract user details
            username = user.screen_name || username;
            displayName = user.name || displayName;
            profileImage = user.profile_image_url_https || user.profile_image_url || '';

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

            // Get media URLs
            const media = legacy.extended_entities?.media || legacy.entities?.media || [];
            const images = media
                .filter(m => m.type === 'photo')
                .map(m => m.media_url_https || m.media_url);

            // Construct tweet URL
            const tweetUrl = `https://twitter.com/${username}/status/${tweetId}`;

            return {
                id: tweetId,
                text: text,
                url: tweetUrl,
                username: username,
                displayName: displayName,
                profileImage: profileImage,
                images: images,
                timestamp: new Date().toISOString()
            };
        } catch (e) {
            console.error('Error extracting tweet data:', e);
            return null;
        }
    }

    // Send tweet data to Discord webhook
    function sendToDiscord(tweetData) {
        const embed = {
            author: {
                name: `${tweetData.displayName} (@${tweetData.username})`,
                icon_url: tweetData.profileImage,
                url: `https://twitter.com/${tweetData.username}`
            },
            description: tweetData.text,
            color: 0x1DA1F2, // Twitter blue
            timestamp: tweetData.timestamp,
            footer: {
                text: 'Posted from Twitter',
                icon_url: 'https://abs.twimg.com/icons/apple-touch-icon-192x192.png'
            }
        };

        // Add first image if available (Discord embeds only support one main image)
        if (tweetData.images.length > 0) {
            embed.image = { url: tweetData.images[0] };
        }

        // Add tweet URL as a field
        embed.fields = [{
            name: 'View on Twitter',
            value: `[Click here](${tweetData.url})`,
            inline: true
        }];

        // If there are multiple images, mention it
        if (tweetData.images.length > 1) {
            embed.fields.push({
                name: 'Additional Images',
                value: `This tweet contains ${tweetData.images.length} images. [View all on Twitter](${tweetData.url})`,
                inline: false
            });
        }

        const payload = {
            username: 'Twitter Notifier',
            avatar_url: 'https://abs.twimg.com/icons/apple-touch-icon-192x192.png',
            embeds: [embed]
        };

        // Use GM_xmlhttpRequest to bypass CORS
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
                } else {
                    console.error('Failed to send to Discord:', response.status, response.responseText);
                }
            },
            onerror: function(error) {
                console.error('Error sending to Discord:', error);
            }
        });
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
                    <input type="text" id="discord-webhook-url" value="${webhookUrl}" style="width: 100%; padding: 8px; margin-bottom: 15px; background: #192734; color: #fff; border: 1px solid #38444d; border-radius: 4px;">
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
            
            GM_setValue('discordWebhookUrl', webhookUrl);
            GM_setValue('discordPostingEnabled', isEnabled);
            
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