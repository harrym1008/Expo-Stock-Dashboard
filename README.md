# ExpoStock

My project is a real-time mobile stock dashboard built with React Native (0.86.3) and Expo (SDK 57.0.19). It provides users with live U.S. stock market data, interactive charts, and portfolio management features. The app uses both the public Yahoo Finance API and the Finnhub API to fetch accurate real-time stock quotes, news and further information. Users can paper-trade stocks in a simulated environment using a virtual portfolio, create watchlists to track stocks, ETFs, commodities and other securities, and view historical and live market data in interactive charts.


## Requirements

Installation requirements for running the project:
- **Node.js**
- **npm**
- **Expo Go App** (iOS / Android) or an Android/iOS emulator
- Optional: **Finnhub API Key** for enhanced stock data, news and live quotes through WebSocket. Making an account at https://finnhub.io is free and provides a free tier API key, whose rate limits are what the app is designed to facilitate. 


## Running ExpoStock

To run the project, follow these steps:
1. Extract the zip file to a folder.
2. Open a terminal and navigate to the project folder.
3. Install dependencies from package.json: `npm install`
4. Create a `.env` file in the root directory and add your Finnhub API key under the variable `EXPO_PUBLIC_FINNHUB_API_KEY`. This can also be entered inside the app inside Settings.
5. Start the application: `npx expo start`
6. Run the app on your device or emulator:
   - **Physical Device:** Scan the QR code displayed in the terminal.
   - **Android Emulator:** Press `a` or `i` in the terminal for Android or iOS respectively.

To run the project's included Jest tests, run `npm test` in the terminal.


## Expo Snack Issues

My project does not working on Expo Snack due to its requirement on dependencies that are not supported by Expo Snack. Additionally, the project was created with Expo SDK 57 when the latest Expo Snack SDK is 55. The source code exists at https://snack.expo.dev/@hpmm1/expo-stock-dashboard but it will not compile nor run on Expo Snack.


---

Created by Harrison McGrath for UoL BSc CS, CM3050 Mobile Development Final Project, July-September 2026.