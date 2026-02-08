# Instagram Propaganda & Fact Checker

A Chrome extension that analyzes Instagram comments for propaganda/bot behavior and fact-checks claims using Google's Gemini AI.

## Features

- 🤖 Bot Detection: Scores comments 1-10 based on propaganda likelihood
- ✅ Fact Checking: Verifies claims made in comments
- 🎨 Visual Indicators: Color-coded borders (green/orange/red)
- 💾 Caching: Stores results locally for performance

## Installation

1. Clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select this directory
5. Click the extension icon and enter your Gemini API key

## Setup

Get a free Gemini API key from [Google AI Studio](https://makersuite.google.com/app/apikey)

## How It Works

The extension scans Instagram comments every 3 seconds, batches them, and sends them to Gemini for analysis. Results are cached and displayed inline with color-coded ratings.
