import {disableAllInput, enableAllInput} from "./utils";

let currentProgressAbortCallback = null;

export function initProgress(options = {}) {
    const { title = "Loading...", filename = "", showAbort = false, onAbort = null } = options;
    
    disableAllInput(title);
    
    const overlay = document.getElementById('input-blocker');
    const filenameDiv = document.getElementById('input-blocker-filename');
    const progressContainer = document.getElementById('input-blocker-progress-container');
    const progressBar = document.getElementById('input-blocker-progress-bar');
    const progressText = document.getElementById('input-blocker-progress-text');
    
    if (filenameDiv && progressContainer && progressBar && progressText) {
        filenameDiv.textContent = filename;
        filenameDiv.style.display = filename ? 'block' : 'none';
        progressContainer.style.display = 'flex';
        progressBar.style.width = '0%';
        progressText.textContent = 'Waiting for server...';
    }
    
    let abortButton = document.getElementById('input-blocker-abort-button');
    if (showAbort && onAbort) {
        currentProgressAbortCallback = onAbort;
        if (!abortButton && overlay) {
            abortButton = document.createElement('button');
            abortButton.id = 'input-blocker-abort-button';
            abortButton.textContent = 'Abort';
            abortButton.style.marginTop = '20px';
            abortButton.style.padding = '10px 30px';
            abortButton.style.fontSize = '18px';
            abortButton.style.cursor = 'pointer';
            abortButton.style.backgroundColor = '#f44336';
            abortButton.style.color = 'white';
            abortButton.style.border = 'none';
            abortButton.style.borderRadius = '5px';
            abortButton.onclick = (e) => {
                e.stopPropagation();
                if (currentProgressAbortCallback) {
                    currentProgressAbortCallback();
                }
            };
            overlay.appendChild(abortButton);
        }
    } else if (abortButton) {
        abortButton.remove();
        currentProgressAbortCallback = null;
    }
}

export function updateProgress(options = {}) {
    const { status, loaded, total, filename, retryInfo } = options;
    
    const filenameDiv = document.getElementById('input-blocker-filename');
    const progressBar = document.getElementById('input-blocker-progress-bar');
    const progressText = document.getElementById('input-blocker-progress-text');
    
    if (filename && filenameDiv) {
        filenameDiv.textContent = filename;
        filenameDiv.style.display = 'block';
    }
    
    if (progressBar && progressText) {
        let text = status || '';
        
        if (retryInfo) {
            text = `Retry ${retryInfo.attempt}/${retryInfo.maxRetries}: Going back ${retryInfo.daysBack} days...`;
        }
        
        if (loaded !== undefined && total !== undefined && total > 0) {
            const percentage = (loaded / total * 100).toFixed(1);
            progressBar.style.width = percentage + '%';
            const loadedKB = (loaded / 1024).toFixed(0);
            const totalKB = (total / 1024).toFixed(0);
            text = `${loadedKB} KB / ${totalKB} KB (${percentage}%)`;
        } else if (status) {
            progressBar.style.width = '0%';
        }
        
        progressText.textContent = text;
    }
}

export function hideProgress() {
    currentProgressAbortCallback = null;
    enableAllInput();
}
