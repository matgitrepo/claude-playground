# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Maintenance Rules

1. **Always keep this file up to date.** After any change to the project — adding files, modifying game logic, changing structure — update the relevant sections of this file before ending the conversation. No need for the user to ask.

2. **Always commit and push changes to GitHub.** After completing any task that modifies the project, stage the relevant files, create a descriptive commit, and push to the remote. No need for the user to ask. Exception: confirm before any destructive git operations (force push, reset --hard, etc.).

## Repository State

This repository contains a single-file browser game built in vanilla HTML/CSS/JS.

### Files
- `index.html` — Tic Tac Toe game (self-contained, no build step required)
- `.vscode/settings.json` — enables Claude Code terminal integration (`claudeCode.useTerminal: true`)

### Game: Tic Tac Toe (`index.html`)
- Two-player (X and O), played in the browser
- Dark-themed UI using CSS Grid for the 3x3 board
- Tracks score across rounds (wins for X, wins for O, draws)
- Highlights the winning cells on victory
- Restart button resets the board without clearing the score

### Running
Open `index.html` directly in a browser — no server or build step needed.
