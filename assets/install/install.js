const platformLabel = {
    linux: "Linux",
    macos: "macOS",
    unknown: "your platform",
    windows: "Windows",
};

function detectPlatform() {
    const userAgent = `${navigator.userAgent || ""} ${navigator.platform || ""}`.toLowerCase();

    if (userAgent.includes("win")) {
        return "windows";
    }

    if (userAgent.includes("mac")) {
        return "macos";
    }

    if (userAgent.includes("linux")) {
        return "linux";
    }

    return "unknown";
}

function formatTimestamp(value) {
    try {
        return new Intl.DateTimeFormat(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
        }).format(new Date(value));
    } catch (error) {
        return value;
    }
}

function choosePrimaryDownload(manifest, platform) {
    const latestFileName = manifest.latestByPlatform?.[platform];
    if (latestFileName) {
        return manifest.downloads.find((download) => download.fileName === latestFileName) || null;
    }

    return manifest.downloads[0] || null;
}

function updateHero(manifest, primaryDownload, platform) {
    const platformElement = document.getElementById("detected-platform");
    const primaryLink = document.getElementById("primary-download");
    const heroNote = document.getElementById("hero-note");
    const releaseMeta = document.getElementById("release-meta");

    platformElement.textContent = `Detected platform: ${platformLabel[platform] || platformLabel.unknown}`;
    releaseMeta.textContent = `Release ${manifest.releaseVersion} · Updated ${formatTimestamp(manifest.generatedAt)}`;

    if (!primaryDownload) {
        primaryLink.classList.add("disabled");
        primaryLink.textContent = "No installer available yet";
        heroNote.textContent = "Installers will appear here after the desktop builds are staged.";
        return;
    }

    primaryLink.classList.remove("disabled");
    primaryLink.href = primaryDownload.url;
    primaryLink.textContent = `${primaryDownload.ctaLabel} (${primaryDownload.version})`;

    if (platform === "linux") {
        heroNote.textContent = "A native Linux installer is not published yet. Download links for the current supported platforms are listed below.";
        return;
    }

    if (primaryDownload.platform === "macos" && primaryDownload.arch === "arm64") {
        heroNote.textContent = "The current macOS installer targets Apple Silicon Macs.";
        return;
    }

    heroNote.textContent = `${primaryDownload.title} installer · ${primaryDownload.sizeHuman}`;
}

function createDownloadCard(download, primaryDownload) {
    const article = document.createElement("article");
    article.className = "download-card";
    if (primaryDownload && primaryDownload.fileName === download.fileName) {
        article.classList.add("is-recommended");
    }

    const badge = primaryDownload && primaryDownload.fileName === download.fileName
        ? '<span class="download-badge">Recommended</span>'
        : `<span class="download-badge">${download.installerType.toUpperCase()}</span>`;

    article.innerHTML = `
        <div class="download-title-row">
            <div>
                <h3 class="download-title">${download.title}</h3>
                <p class="download-meta">Version ${download.version}</p>
            </div>
            ${badge}
        </div>
        <div>
            <p class="download-detail">${download.fileName}</p>
            <p class="download-detail">${download.platformLabel} · ${download.archLabel} · ${download.sizeHuman}</p>
            <p class="download-detail">Built ${formatTimestamp(download.modifiedAt)}</p>
        </div>
        <div class="download-footer">
            <a class="download-link" href="${download.url}">Download</a>
        </div>
    `;

    return article;
}

function renderDownloads(manifest, primaryDownload) {
    const grid = document.getElementById("download-grid");
    grid.innerHTML = "";

    for (const download of manifest.downloads) {
        grid.appendChild(createDownloadCard(download, primaryDownload));
    }
}

async function main() {
    const platform = detectPlatform();

    try {
        const response = await fetch("./downloads/manifest.json", { cache: "no-store" });
        if (!response.ok) {
            throw new Error(`Installer manifest request failed with status ${response.status}`);
        }

        const manifest = await response.json();
        const primaryDownload = choosePrimaryDownload(manifest, platform);

        updateHero(manifest, primaryDownload, platform);
        renderDownloads(manifest, primaryDownload);
    } catch (error) {
        const releaseMeta = document.getElementById("release-meta");
        const grid = document.getElementById("download-grid");
        const primaryLink = document.getElementById("primary-download");
        const heroNote = document.getElementById("hero-note");
        const platformElement = document.getElementById("detected-platform");

        platformElement.textContent = `Detected platform: ${platformLabel[platform] || platformLabel.unknown}`;
        primaryLink.classList.add("disabled");
        primaryLink.textContent = "Installer list unavailable";
        heroNote.textContent = "The installer manifest could not be loaded from this build.";
        releaseMeta.textContent = "Installer metadata unavailable";
        grid.innerHTML = `
            <article class="download-card loading-card">
                <p>Installers are not staged in this build yet.</p>
            </article>
        `;
        console.error(error);
    }
}

main();
