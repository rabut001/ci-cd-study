FROM node:24-bookworm-slim

WORKDIR /workspace

# git: このフェーズの git init / 以降の commit / clone など（node:-slim には含まれない）
# safe.directory: ボリュームマウントで所有者がずれると Git が dubious ownership で拒否するのを防ぐ
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    docker.io \
    git \
    && git config --global --add safe.directory /workspace \
    && rm -rf /var/lib/apt/lists/*

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9 --activate

RUN curl -fsSL https://github.com/supabase/cli/releases/latest/download/supabase_linux_amd64.tar.gz \
    | tar -xz -C /usr/local/bin supabase supabase-go \
    && chmod +x /usr/local/bin/supabase /usr/local/bin/supabase-go

# Playwright (chromium) の実行に必要な OS ライブラリ（フェーズ4の E2E 用）。
# slim イメージには無く、入れないと chromium が libglib-2.0.so.0 不足などで起動できない。
# ブラウザ本体はバージョン結合のため、devcontainer.json の postCreateCommand で
# プロジェクトのピン版（@playwright/test に対応する版）を入れる。ここは OS 依存のみ。
RUN npx --yes playwright install-deps chromium \
    && rm -rf /var/lib/apt/lists/*

# デフォルトは sleep 無限などではなく、compose の command で上書きする想定
CMD ["bash"]