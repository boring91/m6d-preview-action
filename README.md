# M6D Preview

A composite GitHub Action that builds immutable pull-request images, deploys them through the standard M6D CI package, verifies the preview, comments on the pull request, and tears the preview down when the pull request closes.

## Usage

```yaml
name: PR environment

on:
  pull_request:
    branches: [develop]
    types: [opened, synchronize, reopened, closed]

permissions:
  contents: read
  pull-requests: write

concurrency:
  group: m6d-preview-${{ github.repository }}-${{ github.event.pull_request.number }}

jobs:
  preview:
    runs-on: self-hosted
    steps:
      - uses: boring91/m6d-preview-action@v1
        with:
          images: >-
            [
              {
                "name": "web",
                "image": "${{ secrets.DOCKER_HUB_USERNAME }}/example-web",
                "context": "./web",
                "dockerfile": "./web/Dockerfile",
                "build_args": "APP_ENV=preview"
              },
              {
                "name": "api",
                "image": "${{ secrets.DOCKER_HUB_USERNAME }}/example-api",
                "context": "./api",
                "dockerfile": "./api/Dockerfile"
              }
            ]
          registry-username: ${{ secrets.DOCKER_HUB_USERNAME }}
          registry-password: ${{ secrets.DOCKER_HUB_PASSWORD }}
          ssh-host: ${{ secrets.PR_SERVER_HOST }}
          ssh-username: ${{ secrets.PR_SERVER_USERNAME }}
          ssh-key: ${{ secrets.PR_SERVER_KEY }}
```

The action derives the project name, pull-request number, immutable image tag, preview URL, and whether to deploy or tear down from the pull-request event. Set `project` only when the CI project identifier differs from the repository name.

The caller must declare `runs-on`, `permissions`, and `concurrency` because GitHub does not allow a composite action to control its containing job. Secrets must also be passed explicitly. The action checks out the caller repository itself for preview builds.

## Image definitions

`images` is a JSON array. Every item requires `name`, `image`, `context`, and `dockerfile`. `build_args` is an optional newline-separated string. Images are built sequentially and pushed with one immutable tag: `pr-<number>-<commit-sha>`.

On preview creation, the action runs:

```text
cd ~/ci
~/.bun/bin/bun src/index.ts setup <project> <pr-number> <image-tag>
```

On pull-request closure, it runs:

```text
cd ~/ci
~/.bun/bin/bun src/index.ts teardown <project> <pr-number>
```

The CI package must deploy the supplied image tag exactly.

## Requirements

- A Linux runner with Docker and `curl`.
- `contents: read` and `pull-requests: write` permissions.
- Access to this repository from the consuming repository when the action is private.

Use `@main` while developing the action. Pin production consumers to a release tag such as `@v1` or an exact commit SHA.

## Verification

Install dependencies, compile the TypeScript source, and run the build planner check:

```bash
npm ci
npm test
```

Compiled files in `dist/` are committed so consumers can run the action without installing dependencies.
