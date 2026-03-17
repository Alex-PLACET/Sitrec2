function tryNativePrompt(message, defaultValue = "") {
    if (typeof window === "undefined" || typeof window.prompt !== "function") {
        return null;
    }

    try {
        return window.prompt(message, defaultValue);
    } catch (error) {
        console.warn("Native prompt is unavailable, falling back to custom prompt UI.", error);
        return null;
    }
}

export function promptForText({
    cancelLabel = "Cancel",
    confirmLabel = "OK",
    defaultValue = "",
    message = "",
    title = "Input",
    validate = null,
} = {}) {
    if (typeof document === "undefined" || !document.body) {
        return Promise.resolve(tryNativePrompt(message || title, defaultValue));
    }

    return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.55);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 20000;
            padding: 24px;
        `;

        const modal = document.createElement("div");
        modal.style.cssText = `
            width: min(460px, 100%);
            background: #101418;
            color: #f4f7fb;
            border: 1px solid rgba(255, 255, 255, 0.14);
            border-radius: 12px;
            box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
            padding: 20px;
            font-family: Arial, sans-serif;
        `;

        const titleElement = document.createElement("div");
        titleElement.textContent = title;
        titleElement.style.cssText = `
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 10px;
        `;

        const messageElement = document.createElement("div");
        messageElement.textContent = message;
        messageElement.style.cssText = `
            font-size: 14px;
            line-height: 1.45;
            color: rgba(244, 247, 251, 0.8);
            margin-bottom: 14px;
            white-space: pre-wrap;
        `;

        const input = document.createElement("input");
        input.type = "text";
        input.value = defaultValue ?? "";
        input.style.cssText = `
            width: 100%;
            box-sizing: border-box;
            border: 1px solid rgba(255, 255, 255, 0.18);
            border-radius: 8px;
            background: #0b0f13;
            color: #f4f7fb;
            padding: 10px 12px;
            font-size: 15px;
            outline: none;
        `;

        const errorElement = document.createElement("div");
        errorElement.style.cssText = `
            min-height: 18px;
            margin-top: 8px;
            color: #ff8f8f;
            font-size: 13px;
        `;

        const buttonRow = document.createElement("div");
        buttonRow.style.cssText = `
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            margin-top: 18px;
        `;

        const cancelButton = document.createElement("button");
        cancelButton.type = "button";
        cancelButton.textContent = cancelLabel;
        cancelButton.style.cssText = `
            border: 1px solid rgba(255, 255, 255, 0.18);
            border-radius: 8px;
            background: transparent;
            color: #f4f7fb;
            padding: 9px 14px;
            cursor: pointer;
        `;

        const confirmButton = document.createElement("button");
        confirmButton.type = "button";
        confirmButton.textContent = confirmLabel;
        confirmButton.style.cssText = `
            border: 0;
            border-radius: 8px;
            background: #4aa3ff;
            color: #081018;
            padding: 9px 14px;
            font-weight: 600;
            cursor: pointer;
        `;

        const close = (value) => {
            document.removeEventListener("keydown", onKeyDown, true);
            overlay.remove();
            resolve(value);
        };

        const submit = () => {
            const value = input.value;
            const validationMessage = typeof validate === "function" ? validate(value) : "";
            if (validationMessage) {
                errorElement.textContent = validationMessage;
                input.focus();
                input.select();
                return;
            }

            close(value);
        };

        const onKeyDown = (event) => {
            if (event.key === "Escape") {
                event.preventDefault();
                close(null);
                return;
            }

            if (event.key === "Enter") {
                event.preventDefault();
                submit();
            }
        };

        cancelButton.addEventListener("click", () => close(null));
        confirmButton.addEventListener("click", submit);
        overlay.addEventListener("click", (event) => {
            if (event.target === overlay) {
                close(null);
            }
        });
        input.addEventListener("input", () => {
            if (errorElement.textContent) {
                errorElement.textContent = "";
            }
        });
        document.addEventListener("keydown", onKeyDown, true);

        buttonRow.append(cancelButton, confirmButton);
        modal.append(titleElement, messageElement, input, errorElement, buttonRow);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        input.focus();
        input.select();
    });
}
