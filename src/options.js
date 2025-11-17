document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("translation-settings-form");

  // API compatibility
  const brw = typeof browser !== "undefined" ? browser : chrome;

  // Load stored settings
  brw.storage.local.get([
    "engToSpa",
    "spaToEng",
    "translationMode"
  ]).then(settings => {
    document.getElementById("engToSpa").checked = settings.engToSpa ?? true;
    document.getElementById("spaToEng").checked = settings.spaToEng ?? true;

    const mode = settings.translationMode || "full";
    const modeRadio = document.querySelector(`input[name="translationMode"][value="${mode}"]`);
    if (modeRadio) {
      modeRadio.checked = true;
    }
  });

  // Save settings on submit
  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const settings = {
      engToSpa: document.getElementById("engToSpa").checked,
      spaToEng: document.getElementById("spaToEng").checked,
      translationMode: form.translationMode.value
    };

    brw.storage.local.set(settings).then(() => {
      console.log("Translation settings saved:", settings);
      
      // Show success message
      const submitBtn = form.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerHTML;
      submitBtn.innerHTML = '<span class="gradient-text">✓ Saved!</span>';
      submitBtn.disabled = true;
      
      setTimeout(() => {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
      }, 2000);
    }).catch(error => {
      console.error("Failed to save settings:", error);
    });
  });
});