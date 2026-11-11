# Be Clean

A free web app that helps people quit any addiction. Add it to your iPhone home screen and it works like a normal app. No accounts, no API keys, no cost.

## Features
- **Streak**: live clean-time counter, money saved, longest streak, milestones
- **SOS**: breathing exercise, 10-minute craving timer, distraction ideas, your reasons, helpline link
- **Journal**: daily mood, craving level, triggers and notes, with a 14-day chart and top triggers
- **Light reset**: close your eyes while soft light slowly pulses for 20 seconds (one pulse every 2 s, with a safety warning)
- **Coach**: a guided chat. Tap what's happening (craving, slip, stress, loneliness…) and it walks you through proven steps like urge surfing, the HALT check and if-then plans. It uses your own streak, reasons and journal triggers.
- **Private and offline**: all data stays on the phone. Nothing is sent anywhere.

## Run it

```bash
cd be-clean
npm start
```

Open http://localhost:8787.

## Try it on your iPhone
1. Put your Mac and iPhone on the same Wi-Fi.
2. Find your Mac's address: `ipconfig getifaddr en0`
3. On the iPhone, open Safari at `http://<that address>:8787`.
4. Tap Share → **Add to Home Screen**.

To use it anywhere (and get offline mode, which needs HTTPS), upload the `docs` folder to a free static host such as GitHub Pages or Netlify.

## Files
- `docs/`: the whole app (HTML, CSS, JS, icons, offline support)
- `server.js`: a tiny local server for testing
