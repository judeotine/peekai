# PeekAI Browser Extension

PeekAI is a premium browser extension that provides instant AI-powered answers to any text or question found on any webpage.

## Features

### Core Functionality
- **Smart Text Selection**: Automatically detects text selection and shows floating action button
- **Keyboard Shortcuts**: Trigger AI queries with Ctrl+Shift+Q (Cmd+Shift+Q on Mac)
- **Context Menu Integration**: Right-click selected text to "Ask PeekAI"
- **AI-Powered Answers**: Get contextual responses using OpenRouter (GPT-4, Claude, etc.)
- **Follow-up Questions**: Continue conversations within the same modal

### User Interface
- **Floating Action Button**: Appears on text selection with smooth animations
- **Draggable Modal**: Repositionable answer overlay with minimize/pin functionality
- **Dark/Light Themes**: Toggle between themes with persistent settings
- **Stealth Mode**: Hide UI elements, use hotkeys only
- **Responsive Design**: Works on all screen sizes

### Authentication & Billing
- **Supabase Auth**: Email/password and Google OAuth login
- **Subscription Tiers**: Free (10 daily), Student Pro ($4.99), Premium ($9.99)
- **Stripe Integration**: Secure payment processing and subscription management
- **Usage Tracking**: Monitor daily/monthly query limits

### Data Management
- **Query History**: Save and export conversation history
- **Usage Analytics**: Track user interactions and performance
- **Rate Limiting**: Enforce tier-based query limits
- **Data Export**: Export history as Markdown, JSON, or PDF

## Installation

### Development Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd peekai-extension
   ```

2. **Set up the backend (Encore.ts)**
   ```bash
   cd backend
   encore run
   ```

3. **Configure environment variables**
   Set the following secrets in your Encore dashboard:
   - `OpenRouterKey`: Your OpenRouter API key
   - `SupabaseUrl`: Your Supabase project URL
   - `SupabaseAnonKey`: Your Supabase anon key
   - `SupabaseServiceKey`: Your Supabase service key
   - `StripeSecretKey`: Your Stripe secret key
   - `ClerkSecretKey`: Your Clerk secret key (if using Clerk)

4. **Load the extension in Chrome**
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the `extension` folder

### Production Deployment

1. **Deploy the backend**
   ```bash
   encore deploy --env production
   ```

2. **Update API URLs**
   - Update `apiBaseUrl` in `content.js` and `popup.js` with your production API URL

3. **Package the extension**
   - Zip the `extension` folder
   - Upload to Chrome Web Store

## Configuration

### Backend Configuration

The backend uses Encore.ts with the following services:
- **auth**: Authentication and authorization
- **user**: User profile and subscription management
- **ai**: OpenRouter integration for AI queries
- **history**: Query history and analytics
- **billing**: Stripe integration for payments

### Extension Configuration

Update the following files with your production URLs:
- `extension/content.js`: Set `apiBaseUrl`
- `extension/popup.js`: Set `apiBaseUrl`

## API Endpoints

### Authentication
- `POST /auth/signup` - Create new user account
- `POST /auth/signin` - Sign in with email/password
- `POST /auth/google` - Get Google OAuth URL
- `POST /auth/refresh` - Refresh access token
- `POST /auth/signout` - Sign out user

### User Management
- `GET /user/profile` - Get user profile
- `PUT /user/profile` - Update user profile
- `GET /user/profile/usage` - Get usage statistics

### AI Queries
- `POST /ai/ask` - Ask a question (non-streaming)
- `POST /ai/ask/stream` - Ask a question (streaming)

### History
- `GET /history` - Get paginated query history
- `GET /history/recent` - Get recent queries
- `DELETE /history/:id` - Delete specific query
- `DELETE /history` - Clear all history
- `POST /history/export` - Export history

### Billing
- `POST /billing/checkout` - Create Stripe checkout session
- `POST /billing/portal` - Create customer portal session
- `POST /billing/webhook` - Handle Stripe webhooks

## Testing

### Manual Testing Checklist

#### Authentication
- [ ] User signup with email/password
- [ ] User signin with email/password
- [ ] Google OAuth flow
- [ ] Token refresh
- [ ] Sign out functionality

#### AI Functionality
- [ ] Text selection detection
- [ ] Floating button appearance
- [ ] Keyboard shortcut (Ctrl+Shift+Q)
- [ ] Context menu integration
- [ ] AI query processing
- [ ] Follow-up questions
- [ ] Error handling

#### UI/UX
- [ ] Modal positioning and dragging
- [ ] Theme switching (dark/light)
- [ ] Stealth mode toggle
- [ ] Responsive design
- [ ] Animation smoothness

#### Data Persistence
- [ ] Query history saving
- [ ] Settings persistence
- [ ] Usage tracking
- [ ] Rate limiting

#### Billing
- [ ] Subscription upgrade flow
- [ ] Payment processing
- [ ] Customer portal access
- [ ] Webhook handling

### Automated Testing

Run the test suite:
```bash
# Backend tests
cd backend
encore test

# Extension tests (if implemented)
cd extension
npm test
```

## Browser Compatibility

- **Chrome**: Version 88+
- **Edge**: Version 88+
- **Firefox**: Not currently supported (Manifest V3 required)
- **Safari**: Not currently supported

## Security & Privacy

- **Data Encryption**: All API communications use HTTPS
- **Token Security**: JWT tokens with secure storage
- **Privacy Compliance**: GDPR-compliant data handling
- **Content Security**: No sensitive content permanently stored
- **Rate Limiting**: Prevents abuse and ensures fair usage

## Performance

- **Lazy Loading**: Content scripts load only when needed
- **Efficient Caching**: Query results cached for offline access
- **Minimal Footprint**: Lightweight extension with optimized assets
- **Fast Response**: Sub-second AI response times


