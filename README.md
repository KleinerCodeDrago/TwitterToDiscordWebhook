# Twitter to Discord Webhook Userscript

A userscript that automatically posts your tweets to a Discord channel via webhook whenever you tweet on Twitter/X.com.

## Features

- 🔄 Automatically detects when you post a tweet
- 📤 Sends tweet content, images, GIFs, and videos to Discord
- 👥 **Multi-account support** - Configure different webhooks for each Twitter account
- 💬 Reply filtering - Choose whether to include replies in Discord
- 🎯 Visual status indicator shows if posting is active for current account
- ⚙️ Easy configuration through in-app settings
- 🖼️ Rich embed formatting with media support
- 🎨 Customizable messages, media display modes, and footer styles
- 🌐 Multi-language support (English/German)
- 🔒 Uses GM_xmlhttpRequest to bypass CORS restrictions
- 💾 Saves settings per account between sessions

## Installation

1. **Install a userscript manager**:
   - [Tampermonkey](https://www.tampermonkey.net/) (recommended)
   - [Violentmonkey](https://violentmonkey.github.io/)

2. **Install the userscript**:
   - **Option A (Direct install with auto-updates)**: 
     - [Click here to install](https://github.com/KleinerCodeDrago/TwitterToDiscordWebhook/raw/refs/heads/master/twitter-to-discord.user.js)
     - Your userscript manager will prompt you to install
     - The script will automatically check for updates
   - **Option B (Manual install)**:
     - Open `twitter-to-discord.user.js` in your browser
     - Click "Install" when prompted by your userscript manager

## Auto-Updates

The userscript includes auto-update functionality. Your userscript manager will periodically check for updates and notify you when a new version is available. You can also manually check for updates in your userscript manager's dashboard.

## Setup

1. **Get a Discord Webhook URL**:
   - Go to your Discord server
   - Right-click on the channel where you want tweets posted
   - Select "Edit Channel" → "Integrations" → "Webhooks"
   - Click "New Webhook" or select an existing one
   - Copy the webhook URL

2. **Configure the userscript**:
   - Go to Twitter/X.com
   - Look for the Discord icon in the left navigation panel
   - Click it to open settings
   - **For multi-account users**: Select your account from the dropdown or add a new one
   - Paste your webhook URL
   - Configure your preferences:
     - Enable/disable Discord posting for this account
     - Include/exclude replies
     - Choose media display mode (separate or embedded)
     - Select footer style (Twitter or X)
     - Choose language (English or German)
   - Click "Save"

## Usage

Once configured, the userscript runs automatically:

1. Compose and post a tweet as normal
2. Check the status indicator next to the tweet button:
   - 🔵 **Active** - Tweet will be sent to Discord
   - ⚫ **Replies disabled** - Reply won't be sent (when replying)
   - ⚫ **Not configured** - No webhook set for this account
   - ⚫ **Disabled** - Posting is turned off for this account
3. Your tweet will be sent to Discord with:
   - Tweet text (media URLs automatically removed)
   - Images, GIFs, and videos (based on display mode)
   - Link to the original tweet
   - Your Twitter username and profile picture
   - Custom message (if configured)

## Discord Embed Format

The webhook creates a rich embed containing:
- **Author**: Your Twitter display name and @username
- **Description**: The tweet text with "View on Twitter/X" button
- **Media**: Handled based on your display mode:
  - **Embedded mode**: Shows static preview image in embed
  - **Separate mode**: Sends playable GIFs/videos as separate messages
- **Link**: Direct link to view the tweet on Twitter
- **Footer**: Timestamp with Twitter/X icon (customizable)

### Media Display Modes

**Separate Mode** (default):
- Photos are shown in the embed
- GIFs and videos are sent as separate playable messages
- Can be positioned before or after the main tweet embed

**Embedded Mode**:
- All media (photos, GIFs, videos) shown as static preview in embed
- More compact but no video playback

## Multi-Account Support

- Configure different Discord webhooks for each Twitter account
- Settings are saved per account
- Visual indicator shows which accounts are active
- Easy account switching in settings
- Delete account configurations when no longer needed

## Limitations

- Multiple images: Additional images sent as separate embeds
- GIFs/Videos in embedded mode show as static previews only
- Requires the Discord webhook to be publicly accessible
- May need updates if Twitter changes their internal API

## Language Settings

**Discord Timestamps**: Discord shows timestamps (like "Today at" or "Heute um") based on YOUR Discord language settings, not the script's language setting. To see timestamps in German:
1. Go to Discord User Settings → Language
2. Select "Deutsch"
3. Restart Discord

The script's language setting only affects the embed text (footer, buttons, etc.).

## Troubleshooting

**Settings button not appearing:**
- Refresh the page
- Make sure you're on twitter.com or x.com
- Check that the userscript is enabled

**Tweets not posting to Discord:**
- Check the status indicator next to the tweet button
- Verify the webhook URL is correct for the current account
- Check browser console for errors (F12)
- Ensure "Enable Discord posting" is checked for this account
- For replies: Check if "Include replies to tweets" is enabled
- Test the webhook URL manually with a tool like curl

**Status indicator shows wrong status:**
- Click the indicator to open settings
- Verify settings for the current account
- Save settings again to refresh the status

**"Failed to send to Discord" errors:**
- Check if the webhook URL is valid
- Ensure the webhook hasn't been deleted
- Verify Discord server permissions

## Privacy & Security

- This script only sends YOUR tweets (not others')
- Webhook URLs are stored locally in your browser
- No data is sent to third parties
- All communication is directly between your browser and Discord

## Technical Details

The userscript works by:
1. Intercepting XMLHttpRequest calls to Twitter's GraphQL API
2. Detecting successful CreateTweet responses
3. Parsing the tweet data from the response
4. Formatting and sending it to Discord via webhook

## Changelog

### v1.1.x - Multi-Account Support
- Added multi-account support with individual webhook configurations
- Visual status indicator in tweet compose window
- Reply filtering - choose whether to send replies to Discord
- Settings UI redesign with account selector
- Fixed media URL removal from tweet text
- Improved status indicator accuracy for reply windows

### v1.0.x - Enhanced Media & Customization
- Added customizable messages with variables
- Separate vs embedded media display modes
- GIF and video support with playable messages
- Media position control (before/after tweet)
- Footer customization (Twitter/X branding)
- German language support
- Improved media URL handling

## License

This userscript is provided as-is for personal use.