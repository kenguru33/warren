---
description: Create a feature spec file and branch from a short idea
argument-hint: Short feature description
allowed-tools: Read, Write, Glob, Bash(git switch:*)
---

You are helping to create a new feature spec for this application from a short idea provider in the user input below. Always use any rules or requirements set in any CLAUDE.md files when responding

User input: $ARGUMENTS

## High level behavior

Turn the user input above into:

- A feature title in kebab-case (e.g. infrared-sensor-trigger)
- A git branch name not already taken
- A detailed markdown spec file under the _specs/ directory

Then save the spec file to disk and print a short summary of what you did.

## Step 1. Check the current branch 

Check the current Git branch, and abort entire process if there are any uncomitted, unstaged or untracked files in the working directory

## Step 2. Parse the arguments

From `$ARGUMENTS`, extract:

1. `feature_title`
  - A short, human readable title in Title Case.
  - Example: "Card Component for Room Dashbord"

2. `feature_slug`
  - A git safe slug.
  - Rules:
    - Lowercase
    - Kebab-case
    - Only `a-z`, `0-9` and `-`
    - Replace spaces and punctation with `-`
    - Collapse multiple `-` into one
    - Trim `-` from start and end
    - Max length 40 characters
  - Example `sensor-compnent` or `dashboard-room-component`

  3. `branch_name`
    - Format: `claude/featue/<feature_slug>`
    - Example: `claude/feature/sensor-compnent`

  If you cannot infer a sensible `feature_title` and `feature_slug`, ask the user to clarify instead of guessing.

## Step 3. Switch to new Git branch

Before making any content, switch to a new Git branch using `branch_name` derived from the `$ARGUMENTS`. If the branch name is already taken, then append a version number to it: e.g. `claude/feature/sensor-component-01`

## Step 4. Draft the spec content

Create a markdown spec document that Plan Mode can use directly and save in the _specs folder using `feature_slug`. Use the exact structure as defined in the spec template file here: @_specs/template.md. Do not add technical implementation details such as code examples.

## Step 5. Final output to the user

After the file is saved, respond to the user with a short summary in til exact format:

Branch: <branch_name>
Spec file: specs/<feature_slug>.md
Title: <feature_title>

Do not repeat the full spec in the chat output unless the user explicitly asks to see it. The main goal is to save the spec file and report where it lives and what branch to use.


