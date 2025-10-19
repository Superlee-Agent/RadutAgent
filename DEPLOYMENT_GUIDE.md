# Deployment Guide - Vercel with Story Protocol

This guide covers deploying the IP Assistant application to Vercel and configuring required environment variables.

## Prerequisites

- Vercel account (https://vercel.com)
- Story Protocol API key (obtained from Story Protocol)
- Git repository connected to Vercel

## Environment Variables Required

### For Vercel Deployment

Before deploying, you must set the following environment variable in your Vercel project:

#### `STORY_API_KEY` (Required)

- **Purpose**: API key for Story Protocol to fetch IP asset information
- **Where to get it**: Story Protocol dashboard or your administrator
- **Format**: Should be a valid API key string

### How to Add Environment Variables in Vercel

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add a new environment variable:
   - **Name**: `STORY_API_KEY`
   - **Value**: Your actual API key
   - **Environments**: Select all (Production, Preview, Development)
4. Click **Save**

## Deployment Steps

### 1. Deploy to Vercel

```bash
# If using Vercel CLI
vercel

# Or push to your connected Git repository
git push origin main
```

### 2. Verify API Key is Set

After deployment, verify that the environment variable is correctly set:

1. Go to your Vercel project dashboard
2. Go to **Deployments** and select the latest deployment
3. Check the **Environment** tab to confirm `STORY_API_KEY` is present

## Troubleshooting

### Issue: "Server configuration error: STORY_API_KEY not set"

**Solution**:

- Verify the environment variable is added in Vercel project settings
- Redeploy the project after adding the variable
- Ensure the variable is set for the correct environment (Production, Preview, or Development)

### Issue: "Failed to fetch IP assets from Story API"

**Possible causes**:

1. Invalid API key - verify it's correct in Vercel environment settings
2. Story API is down - check Story Protocol status
3. Network connectivity issue - check your Vercel region settings

**Solution**:

- Check the detailed error message in the browser console
- Verify API key validity with Story Protocol support
- Contact Story Protocol support if the API is having issues

### Issue: "Invalid Ethereum address format"

**Solution**:

- Ensure the wallet address is a valid Ethereum address (starts with 0x, followed by 40 hexadecimal characters)
- Example valid format: `0x1234567890123456789012345678901234567890`

## Local Development

For local development, add the following to your `.env` file (never commit this file):

```
STORY_API_KEY=your_actual_api_key_here
```

## API Endpoints

- **Check IP Assets**: `POST /api/check-ip-assets`
  - Body: `{ address: "0x..." }`
  - Returns: `{ address, totalCount, originalCount, remixCount }`

## Security Notes

- Never commit `.env` files to version control
- Always use Vercel's environment variable system for production secrets
- API keys should only be used server-side (in the `/api` directory or serverless functions)

## Known Improvements in This Version

### Enhanced Error Handling

- Detailed error messages from Story API are now propagated to the client
- Specific error codes and messages help identify configuration issues
- Console logging includes context (address, offset, iteration count)

### API Response Validation

- Strict validation of asset objects to prevent processing malformed data
- Pagination logic includes safety checks and iteration limits
- Empty response handling prevents infinite loops

### Security Enhancements

- CORS configuration with origin whitelisting (development and preview domains)
- Security headers added (X-Content-Type-Options, X-Frame-Options, X-XSS-Protection)
- Environment variable validation with meaningful error messages

### Pagination Robustness

- Maximum iteration limit (50) prevents accidental infinite loops
- Empty asset response detection stops pagination gracefully
- Detailed logging for debugging pagination issues

## Support

For issues with Story Protocol API:

- Contact Story Protocol support
- Check Story API documentation at https://api.storyapis.com
- Verify API key is valid and has proper permissions

For Vercel deployment issues:

- Check Vercel documentation: https://vercel.com/docs
- Use Vercel Support for account/deployment issues
- Review build logs in Vercel dashboard

For IP Assistant specific issues:

- Check DEPLOYMENT_GUIDE.md (this file) for configuration
- Review server logs: `vercel logs`
- Check browser console for client-side errors
