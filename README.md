**Welcome to your Base44 project** 

**About**

View and Edit  your app on [Base44.com](http://Base44.com) 

This project contains everything you need to run your app locally.

**Edit the code in your local development environment**

Any change pushed to the repo will also be reflected in the Base44 Builder.

**Prerequisites:** 

1. Clone the repository using the project's Git URL 
2. Navigate to the project directory
3. Install dependencies: `npm install`
4. Create an `.env.local` file and set the right environment variables

```
VITE_BASE44_APP_ID=your_app_id
VITE_BASE44_APP_BASE_URL=your_backend_url

e.g.
VITE_BASE44_APP_ID=cbef744a8545c389ef439ea6
VITE_BASE44_APP_BASE_URL=https://my-to-do-list-81bfaad7.base44.app
```

Run the app: `npm run dev`

## Mobile Development (Expo Go)

An Expo React Native app is now available in the `mobile` folder for iterative mobile testing.

### First-time setup

1. Install root dependencies: `npm install`
2. Install mobile dependencies: `cd mobile && npm install`
3. Ensure `mobile/.env` exists with:

```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

You can copy from `mobile/.env.example` and fill values.

### Run with Expo Go

From repo root:

- `npm run mobile:start` (shows QR for Expo Go)
- `npm run mobile:android`
- `npm run mobile:ios`
- `npm run mobile:web`

### Notes

- Expo Go is for rapid testing while finalizing features.
- Production APK/AAB/iOS builds will be generated later using Expo EAS Build.

**Publish your changes**

Open [Base44.com](http://Base44.com) and click on Publish.

**Docs & Support**

Documentation: [https://docs.base44.com/Integrations/Using-GitHub](https://docs.base44.com/Integrations/Using-GitHub)

Support: [https://app.base44.com/support](https://app.base44.com/support)
