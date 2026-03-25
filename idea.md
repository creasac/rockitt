# Rockitt

## What It Is

Rockitt is a voice-first Chrome extension that opens in a side panel.

People should be able to click the extension and immediately interact with it by voice, while still having text input available when they want it.

## Core Experience

- Voice is the primary interaction mode
- Text is supported as a secondary mode
- The side panel opens when the extension is clicked
- By default, the UI shows a live animation instead of a transcript
- A button lets the user reveal the transcript and message history when they want it
- This default can later be changed in settings
- Voice should start only when the user actively taps to begin
- The product should not keep an always-on voice session running because of cost

## What Users Can Ask

- Questions about the page they are currently viewing
- Questions about other pages on the web
- General web questions that need real fetched data

## How It Should Feel

Rockitt should feel like something you ask questions to and get immediate answers from, based on real web data.

It should not feel like a generic chat app.

## Product Direction

- ElevenLabs powers the voice agent
- The agent asks Firecrawl to fetch the data it needs
- Rockitt answers based on that fetched data
- Page context should feel seamless, without visible toggles or buttons
- Access to page context should happen only when needed, to stay mindful of cost and unnecessary data transfer

## Interface Direction

- The default screen is a voice-focused animation view
- The usual chat interface exists behind a button that hides the animation and reveals transcripts
- A settings button should be visible at the top right
- The design should use very little text
- The visual direction should feel clean, sharp, modern, minimal, and aesthetic

## Build Sequence

We will build this in stages:

1. Create the UI first, with no logic
2. Add ElevenLabs voice and text interaction
3. Add Firecrawl-backed fetching and grounded answers

## Notes

- The side panel is the main interface
- The product is voice-first
- [rockitt.svg](/home/d11a/projects/rockitt/rockitt.svg) is the current icon/brand asset
