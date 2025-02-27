document.addEventListener("DOMContentLoaded", function () {
  initializeSecurityLevelListener();
  initializeFormSubmission();
  initializeDynamicRuleHandling();
  initializeTooltips();

  window.complianceAPI.onProcessingError((errorMessage) => {
    showError(errorMessage);
    hideLoadingScreen()
    document.getElementById("form-section").classList.remove("d-none");
  });
});

/**
* Initializes the security level dropdown listener to toggle input fields dynamically.
*/
function initializeSecurityLevelListener() {
  document.getElementById("securityLevel").addEventListener("change", function () {
      const securityLevel = this.value;
      toggleVisibility("dynamic-security-rules", securityLevel === "medium" || securityLevel === "high");
      toggleVisibility("source-header", securityLevel === "high");

      if ((securityLevel === "medium" || securityLevel === "high") && document.querySelectorAll(".rule-entry").length === 0) {
          addSecurityRuleEntry();
      }

      updateExistingRuleFields(securityLevel);
  });
}

function hideLoadingScreen() {
  document.getElementById("loading-screen").classList.add("d-none");
}

/**
 * Handles the completion of the file processing.
 */
window.complianceAPI.onProcessingComplete((processedData, fileName) => {
  // Hide loading screen
  hideLoadingScreen()

  // Show output preview
  const outputSection = document.getElementById("output-section");
  outputSection.classList.remove("d-none");
  document.getElementById("file-content").textContent = processedData;

  // Ensure the output is visible
  document.getElementById("form-section").classList.add("d-none");
  outputSection.scrollIntoView({ behavior: "smooth" });

  // Enable and configure the download button
  const downloadBtn = document.getElementById("download-btn");
  downloadBtn.classList.remove("disabled");
  downloadBtn.removeEventListener("click", handleDownload); // Remove previous event listeners to avoid duplicates
  downloadBtn.addEventListener("click", () => handleDownload(processedData, fileName));
});

/**
* Handles file download functionality.
*/
function handleDownload(processedData, fileName) {
  const blob = new Blob([processedData], { type: "text/yaml" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
}

/**
* Initializes the form submission listener.
*/
function initializeFormSubmission() {
  document.getElementById("securityForm").addEventListener("submit", function (event) {
      event.preventDefault();
      startProcessing();
  });
}

/**
* Initializes dynamic rule handling (add/remove security rules).
*/
function initializeDynamicRuleHandling() {
  document.getElementById("add-rule-btn").addEventListener("click", function () {
      addSecurityRuleEntry();
  });
}

/**
* Dynamically adds a new security rule input row.
*/
function addSecurityRuleEntry() {
  const rulesContainer = document.getElementById("rules-container");
  const securityLevel = document.getElementById("securityLevel").value;

  const ruleRow = document.createElement("div");
  ruleRow.classList.add("row", "mb-2", "rule-entry");

  ruleRow.innerHTML = `
      <div class="col-md-3">
          <select class="form-select component-select">
              <option value="SecurityGroupALB">Load Balancer</option>
              <option value="SecurityGroupECS">ECS Instance</option>
              <option value="SecurityGroupDB">Database</option>
          </select>
      </div>
      <div class="col-md-2">
          <input type="text" class="form-control protocol-input" aria-label="Protocol">
      </div>
      <div class="col-md-2">
          <input type="text" class="form-control port-input" aria-label="Port">
      </div>
      ${securityLevel === "high" ? `
      <div class="col-md-3">
          <input type="text" class="form-control source-input" aria-label="Source IP">
      </div>` : ""}
      <div class="col-md-2 d-flex align-items-center">
          <button type="button" class="btn btn-danger remove-rule-btn">Remove</button>
      </div>
  `;

  rulesContainer.appendChild(ruleRow);

  // Initialize Bootstrap tooltips for the new rule row
  initializeTooltips();

  // Add event listener to remove rule button
  ruleRow.querySelector(".remove-rule-btn").addEventListener("click", function () {
      ruleRow.remove();
  });
}


/**
* Updates existing rule fields when switching between medium and high security levels.
*/
function updateExistingRuleFields(securityLevel) {
  document.querySelectorAll(".rule-entry").forEach(ruleRow => {
      const sourceField = ruleRow.querySelector(".source-input");

      if (securityLevel === "high" && !sourceField) {
          // Add source field if switching to high
          const sourceCol = document.createElement("div");
          sourceCol.classList.add("col-md-3");
          sourceCol.innerHTML = `<input type="text" class="form-control source-input" aria-label="Source IP">`;
          ruleRow.insertBefore(sourceCol, ruleRow.children[3]);
      } else if (securityLevel !== "high" && sourceField) {
          // Remove source field if switching back to medium
          sourceField.parentElement.remove();
      }
  });

  initializeTooltips();
}

/**
* Handles the processing of the uploaded CloudFormation template.
*/
async function startProcessing() {
  const fileInput = document.getElementById("templateUpload").files[0];
  const securityLevel = document.getElementById("securityLevel").value;

  // Validate file input
  if (!fileInput) {
      showError("Please select a valid CloudFormation template (YAML) before proceeding!");
      return;
  }

  // Validate security rules
  const additionalParams = getSecurityParameters(securityLevel);
  if (securityLevel != "low" && !additionalParams) return;

  // Hide previous errors and show the loading screen
  hideError();
  toggleVisibility("form-section", false);
  toggleVisibility("loading-screen", true);

  // Convert file to Uint8Array
  const arrayBuffer = await fileInput.arrayBuffer();
  const fileData = new Uint8Array(arrayBuffer);

  // Extract file name and extension
  const fileName = fileInput.name;
  const fileExtension = fileName.split(".").pop().toLowerCase();

  // Validate file format
  if (!["yaml", "yml"].includes(fileExtension)) {
      showError("Invalid file format. Please upload a YAML file.");
      resetForm();
      return;
  }

  // Use Electron API to process the file
  window.complianceAPI.processFile(fileName, fileData, securityLevel, additionalParams);
}

/**
* Collects security parameters dynamically from all rule entries.
*/
function getSecurityParameters(securityLevel) {
  let rules = [];

  document.querySelectorAll(".rule-entry").forEach(ruleRow => {
      const component = ruleRow.querySelector(".component-select").value;
      const protocol = ruleRow.querySelector(".protocol-input").value.trim();
      const port = ruleRow.querySelector(".port-input").value.trim();
      const source = ruleRow.querySelector(".source-input")?.value.trim() || "";

      if (!protocol || !port || (securityLevel === "high" && !source)) {
          showError("Please ensure all fields are filled out correctly.");
          return null;
      }

      rules.push({ component, protocol, port, ...(securityLevel === "high" && { source }) });
  });
  console.log(rules)
  return rules.length ? { rules } : null;
}

/**
* Displays an error message on the UI.
*/
function showError(message) {
  const errorContainer = document.getElementById("error-message");
  errorContainer.textContent = message;
  errorContainer.classList.remove("d-none");
}

/**
* Hides the error message.
*/
function hideError() {
  document.getElementById("error-message").classList.add("d-none");
}

/**
* Toggles the visibility of an element.
*/
function toggleVisibility(elementId, isVisible) {
  document.getElementById(elementId).classList.toggle("d-none", !isVisible);
}

/**
* Initializes Bootstrap tooltips.
*/
function initializeTooltips() {
  document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => {
      if (typeof bootstrap !== "undefined" && bootstrap.Tooltip) {
          new bootstrap.Tooltip(el);
      } else {
          console.error("Bootstrap Tooltip is not loaded.");
      }
  });
}
