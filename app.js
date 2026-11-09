/* =========================================================
   EMPLOYEE ONBOARDING SYSTEM - MAIN JAVASCRIPT
   API + LOCAL DATA FALLBACK
   ========================================================= */
"use strict";

const API_BASE_URL = "https://api.freeprojectapi.com/api/EmployeeOnboarding";
const COMPANY_API_URL = API_BASE_URL;
const EMPLOYEE_API_URL = API_BASE_URL;

let companies = [];
let employees = [];
let masterData = [];
let onboardingData = [];
let employeeDocuments = [];
let dropdownMasters = {};

let selectedCompanyId = null;
let selectedEmployeeId = null;
let selectedMasterId = null;
let selectedDocumentId = null;
let editingMasterId = null;
let editingDocumentId = null;
let onboardingEmployeeId = null;

const STORAGE = {
  companies: "companies",
  employees: "employees",
  masterData: "masterData",
  onboarding: "onboardingData",
  documents: "employeeDocuments",
  employeeOverrides: "employeeOverrides",
  deletedEmployees: "deletedEmployees"
};

function el(id) { return document.getElementById(id); }
function text(id, value) { const e = el(id); if (e) e.textContent = value ?? ""; }
function value(id) { const e = el(id); return e ? String(e.value ?? "").trim() : ""; }
function setValue(id, v) { const e = el(id); if (e) e.value = v ?? ""; }

function escapeHTML(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(v) {
  if (!v) return "-";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString();
}

function todayISO() { return new Date().toISOString(); }

function parseJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
  catch { return fallback; }
}

function loadLocalData() {
  companies = parseJSON(STORAGE.companies, []);
  employees = parseJSON(STORAGE.employees, []);
  masterData = parseJSON(STORAGE.masterData, []);
  onboardingData = parseJSON(STORAGE.onboarding, []);
  employeeDocuments = parseJSON(STORAGE.documents, []);
}

function saveLocalData() {
  localStorage.setItem(STORAGE.companies, JSON.stringify(companies));
  localStorage.setItem(STORAGE.employees, JSON.stringify(employees));
  localStorage.setItem(STORAGE.masterData, JSON.stringify(masterData));
  localStorage.setItem(STORAGE.onboarding, JSON.stringify(onboardingData));
  localStorage.setItem(STORAGE.documents, JSON.stringify(employeeDocuments));
}

function getEmployeeOverrides() { return parseJSON(STORAGE.employeeOverrides, {}); }
function saveEmployeeOverrides(v) { localStorage.setItem(STORAGE.employeeOverrides, JSON.stringify(v)); }
function getDeletedEmployees() { return parseJSON(STORAGE.deletedEmployees, []); }
function saveDeletedEmployees(v) { localStorage.setItem(STORAGE.deletedEmployees, JSON.stringify(v)); }

function bootstrapModal(id) {
  const node = el(id);
  if (!node || !window.bootstrap) return null;
  return bootstrap.Modal.getOrCreateInstance(node);
}

function showModal(id) { const m = bootstrapModal(id); if (m) m.show(); }
function hideModal(id) { const m = bootstrapModal(id); if (m) m.hide(); }

function apiErrorMessage(data, fallback = "Request failed.") {
  if (!data) return fallback;
  if (typeof data === "string") return data;
  if (data.message) return data.message;
  if (data.errors) {
    const messages = [];
    Object.values(data.errors).forEach(v => {
      if (Array.isArray(v)) messages.push(...v);
      else if (v) messages.push(String(v));
    });
    if (messages.length) return messages.join(" ");
  }
  return fallback;
}

async function fetchJSON(url, options = {}) {
  const response = await fetch(url, options);
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!response.ok) {
    const err = new Error(apiErrorMessage(data, `HTTP ${response.status}`));
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data;
}

function normalizeList(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.data)) return data.data;
  if (data && Array.isArray(data.result)) return data.result;
  return [];
}

/* =========================================================
   PAGE INITIALIZATION
   ========================================================= */
document.addEventListener("DOMContentLoaded", async () => {
  loadLocalData();
  await initPage();
});

async function initPage() {
  if (el("loginForm")) initLogin();

  if (el("companyForm") || el("companiesTable")) {
    await loadCompaniesFromAPI();
    renderCompanies();
    initCompanySearch();
    initCompanyForm();
  }

  if (el("masterForm") || el("masterTableBody")) {
    await loadMasterDataFromAPI();
    renderMasterData();
    initMasterData();
  }

  if (el("employeeTableBody")) {
    await loadCompaniesFromAPI();
    await loadEmployeesFromAPI();
    renderEmployees();
    initEmployeeFilters();
  }

  if (el("addEmployeeForm")) {
    await loadCompaniesFromAPI();
    await loadEmployeesFromAPI();
    await loadMasterDataFromAPI();
    await loadDropdownMasters();
    populateEmployeeDropdowns("employee");
    initAddEmployeeForm();
  }

  if (el("editEmployeeForm")) {
    await loadCompaniesFromAPI();
    await loadEmployeesFromAPI();
    await loadMasterDataFromAPI();
    await loadDropdownMasters();
    populateEmployeeDropdowns("edit");
    await loadEmployeesFromAPI();
    loadEditEmployee();
  }

  if (el("employeeName")) {
    await loadCompaniesFromAPI();
    await loadEmployeesFromAPI();
    loadEmployeeDetails();
  }

  if (el("dashboardEmployees")) {
    await loadCompaniesFromAPI();
    await loadEmployeesFromAPI();
    updateDashboardStats();
    renderRecentEmployees();
  }

  if (el("onboardingTableBody")) {
    await loadEmployeesFromAPI();
    renderOnboarding();
    initOnboarding();
  }

  if (el("documentsTableBody")) {
    await loadEmployeesFromAPI();
    renderDocuments();
    initDocuments();
    populateDocumentEmployeeDropdown();
  }
}

/* =========================================================
   LOGIN
   ========================================================= */
function initLogin() {
  const form = el("loginForm");
  if (!form || form.dataset.bound === "1") return;
  form.dataset.bound = "1";

  form.addEventListener("submit", e => {
    e.preventDefault();
    const username = value("username");
    const password = value("password");
    const alertBox = el("alertBox");

    if (!username || !password) {
      if (alertBox) alertBox.innerHTML = '<div class="alert alert-danger">Please enter username and password.</div>';
      return;
    }

    localStorage.setItem("eosLoggedIn", "true");
    localStorage.setItem("eosUsername", username);
    window.location.href = "dashboard.html";
  });
}

function logout() {
  localStorage.removeItem("eosLoggedIn");
  localStorage.removeItem("eosUsername");
  window.location.href = "index.html";
}

/* =========================================================
   COMPANY API / UI
   ========================================================= */
async function loadCompaniesFromAPI() {
  try {
    const data = await fetchJSON(`${COMPANY_API_URL}/GetCompanies`);
    const list = normalizeList(data);
    if (list.length || Array.isArray(data)) {
      companies = list.map(c => ({
        id: c.companyId ?? c.id,
        companyId: c.companyId ?? c.id,
        name: c.companyName ?? c.name ?? "",
        companyName: c.companyName ?? c.name ?? "",
        email: c.email ?? "",
        phone: c.phone ?? "",
        address: c.address ?? c.location ?? "",
        pinCode: c.pinCode ?? "",
        status: c.status ?? "Active"
      }));
      localStorage.setItem(STORAGE.companies, JSON.stringify(companies));
    }
  } catch (err) {
    console.warn("Company API unavailable; using local company data.", err);
  }
}

function renderCompanies(list = companies) {
  const tbody = el("companiesTable");
  if (!tbody) return;
  text("companyCount", list.length);
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4">No companies found.</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(c => {
    const name = c.name || c.companyName || "Unknown";
    const status = c.status || "Active";
    return `<tr>
      <td><div class="avatar">${escapeHTML(name.charAt(0).toUpperCase())}</div></td>
      <td><strong>${escapeHTML(name)}</strong></td>
      <td>${escapeHTML(c.email || "-")}</td>
      <td>${escapeHTML(c.phone || "-")}</td>
      <td>${escapeHTML(c.address || "-")} ${c.pinCode ? `<small class="text-muted">(${escapeHTML(c.pinCode)})</small>` : ""}</td>
      <td><span class="badge ${String(status).toLowerCase() === "inactive" ? "bg-secondary" : "bg-success"}">${escapeHTML(status)}</span></td>
    </tr>`;
  }).join("");
}

function initCompanySearch() {
  const input = el("companySearch");
  if (!input || input.dataset.bound === "1") return;
  input.dataset.bound = "1";
  input.addEventListener("input", () => {
    const q = input.value.toLowerCase().trim();
    renderCompanies(companies.filter(c => {
      const s = [c.name, c.companyName, c.email, c.phone, c.address].join(" ").toLowerCase();
      return s.includes(q);
    }));
  });
}

function openCompanyModal() {
  selectedCompanyId = null;
  setValue("companyId", "");
  setValue("companyName", "");
  setValue("companyEmail", "");
  setValue("companyPhone", "");
  setValue("companyLocation", "");
  setValue("companyPinCode", "");
  setValue("companyStatus", "Active");
  text("companyModalTitle", "Add Company");
  showModal("companyModal");
}

function initCompanyForm() {
  const form = el("companyForm");
  if (!form || form.dataset.bound === "1") return;
  form.dataset.bound = "1";
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const companyData = {
      companyName: value("companyName"),
      email: value("companyEmail"),
      phone: value("companyPhone"),
      address: value("companyLocation"),
      pinCode: value("companyPinCode")
    };
    if (!companyData.companyName || !companyData.email || !companyData.pinCode) {
      alert("Please fill Company Name, Email and PIN Code.");
      return;
    }
    try {
      await addCompanyToAPI(companyData);
      hideModal("companyModal");
      await loadCompaniesFromAPI();
      renderCompanies();
    } catch (err) {
      alert(err.message || "Unable to add company.");
    }
  });
}

async function addCompanyToAPI(companyData) {
  const duplicate = companies.some(c => String(c.name || c.companyName).trim().toLowerCase() === companyData.companyName.toLowerCase());
  if (duplicate) throw new Error("Company name already exists. Please use a different company name.");
  await fetchJSON(`${COMPANY_API_URL}/PostCompany`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(companyData)
  });
}

function deleteCompany(id) {
  selectedCompanyId = id;
  showModal("deleteCompanyModal");
}

async function confirmDeleteCompany() {
  if (selectedCompanyId == null) return;
  try {
    await fetchJSON(`${COMPANY_API_URL}/DeleteCompany?id=${encodeURIComponent(selectedCompanyId)}`, { method: "DELETE" });
    hideModal("deleteCompanyModal");
    selectedCompanyId = null;
    await loadCompaniesFromAPI();
    renderCompanies();
  } catch (err) {
    alert(err.message || "Unable to delete company.");
  }
}

/* =========================================================
   MASTER DATA
   ========================================================= */
async function loadMasterDataFromAPI() {
  try {
    const data = await fetchJSON(`${API_BASE_URL}/getAllMaster`);
    const list = normalizeList(data);
    if (list.length) {
      masterData = list.map(m => ({
        id: m.id ?? m.masterId ?? m.masterDataId,
        name: m.name ?? m.masterName ?? m.value ?? m.masterValue ?? "",
        type: m.type ?? m.masterType ?? m.masterFor ?? "",
        description: m.description ?? "",
        status: m.status ?? "Active"
      }));
      localStorage.setItem(STORAGE.masterData, JSON.stringify(masterData));
    }
  } catch (err) {
    console.warn("Master API unavailable; using local master data.", err);
  }
}

async function loadDropdownMasters() {
  try {
    const data = await fetchJSON(`${API_BASE_URL}/getDropdownMasters`);
    dropdownMasters = data || {};
  } catch (err) {
    console.warn("Dropdown master API unavailable.", err);
    dropdownMasters = {};
  }
}

function openMasterModal() {
  editingMasterId = null;
  setValue("masterId", "");
  setValue("masterName", "");
  setValue("masterType", "");
  setValue("masterDescription", "");
  setValue("masterStatus", "Active");
  text("masterModalTitle", "Add Master Data");
  showModal("masterModal");
}

function initMasterData() {
  const form = el("masterForm");
  if (form && form.dataset.bound !== "1") {
    form.dataset.bound = "1";
    form.addEventListener("submit", e => {
      e.preventDefault();
      const name = value("masterName");
      const type = value("masterType");
      if (!name || !type) return alert("Please enter master name and type.");
      const id = editingMasterId ?? Date.now();
      const record = { id, name, type, description: value("masterDescription"), status: value("masterStatus") || "Active" };
      const index = masterData.findIndex(x => String(x.id) === String(id));
      if (index >= 0) masterData[index] = record; else masterData.push(record);
      saveLocalData();
      renderMasterData();
      hideModal("masterModal");
      editingMasterId = null;
    });
  }
  const search = el("masterSearch");
  if (search && search.dataset.bound !== "1") { search.dataset.bound = "1"; search.addEventListener("input", renderMasterData); }
  const filter = el("masterTypeFilter");
  if (filter && filter.dataset.bound !== "1") { filter.dataset.bound = "1"; filter.addEventListener("change", renderMasterData); }
}

function renderMasterData() {
  const tbody = el("masterTableBody");
  if (!tbody) return;
  const q = value("masterSearch").toLowerCase();
  const type = value("masterTypeFilter");
  const list = masterData.filter(m => (!q || `${m.name} ${m.type} ${m.description}`.toLowerCase().includes(q)) && (!type || m.type === type));
  text("masterCount", list.length);
  if (!list.length) { tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4">No master data found.</td></tr>'; return; }
  tbody.innerHTML = list.map(m => `<tr>
    <td>${escapeHTML(m.name)}</td><td>${escapeHTML(m.type)}</td><td>${escapeHTML(m.description || "-")}</td>
    <td><span class="badge ${m.status === "Inactive" ? "bg-secondary" : "bg-success"}">${escapeHTML(m.status || "Active")}</span></td>
    <td class="text-center"><button class="btn btn-sm btn-warning me-1" onclick="editMaster(${JSON.stringify(m.id)})">Edit</button><button class="btn btn-sm btn-danger" onclick="deleteMaster(${JSON.stringify(m.id)})">Delete</button></td>
  </tr>`).join("");
}

function editMaster(id) {
  const m = masterData.find(x => String(x.id) === String(id));
  if (!m) return;
  editingMasterId = id;
  setValue("masterId", m.id); setValue("masterName", m.name); setValue("masterType", m.type); setValue("masterDescription", m.description); setValue("masterStatus", m.status || "Active");
  text("masterModalTitle", "Edit Master Data");
  showModal("masterModal");
}

function deleteMaster(id) { selectedMasterId = id; showModal("deleteMasterModal"); }
function confirmDeleteMaster() {
  if (selectedMasterId == null) return;
  masterData = masterData.filter(x => String(x.id) !== String(selectedMasterId));
  saveLocalData(); renderMasterData(); hideModal("deleteMasterModal"); selectedMasterId = null;
}

/* =========================================================
   EMPLOYEE API
   ========================================================= */
async function loadEmployeesFromAPI() {
  try {
    const data = await fetchJSON(`${EMPLOYEE_API_URL}/GetEmployees`);
    const list = normalizeList(data);
    const overrides = getEmployeeOverrides();
    const deleted = new Set(getDeletedEmployees().map(String));
    if (list.length || Array.isArray(data)) {
      employees = list.map(emp => {
        const id = emp.employeeId ?? emp.id;
        const mapped = normalizeEmployee(emp, id);
        return { ...mapped, ...(overrides[String(id)] || {}) };
      }).filter(emp => !deleted.has(String(emp.id)));
      localStorage.setItem(STORAGE.employees, JSON.stringify(employees));
    } else if (employees.length) {
      employees = employees.filter(emp => !deleted.has(String(emp.id)));
    }
  } catch (err) {
    console.warn("Employee API unavailable; using local employee data.", err);
  }
}

function normalizeEmployee(emp, id) {
  return {
    id,
    employeeId: emp.employeeId ?? id,
    name: emp.fullName ?? emp.name ?? "",
    fullName: emp.fullName ?? emp.name ?? "",
    firstName: emp.firstName ?? "",
    lastName: emp.lastName ?? "",
    email: emp.email ?? "",
    phone: emp.phone1 ?? emp.phone ?? "",
    phone1: emp.phone1 ?? emp.phone ?? "",
    phone2: emp.phone2 ?? "",
    department: emp.department ?? "",
    designation: emp.designation ?? "",
    company: emp.company ?? "",
    joiningDate: emp.dateOfJoining ?? emp.joiningDate ?? "",
    dateOfJoining: emp.dateOfJoining ?? emp.joiningDate ?? "",
    status: emp.employmentStatus ?? emp.status ?? "Active",
    employmentStatus: emp.employmentStatus ?? emp.status ?? "Active",
    dateOfBirth: emp.dateOfBirth ?? emp.dob ?? "",
    gender: emp.gender ?? "",
    employmentType: emp.employeeType ?? emp.employmentType ?? "",
    employeeType: emp.employeeType ?? emp.employmentType ?? "",
    location: emp.location ?? "",
    address: emp.address ?? emp.presentAddress ?? "",
    presentAddress: emp.presentAddress ?? emp.address ?? "",
    city: emp.city ?? "",
    province: emp.province ?? "",
    pincode: emp.pincode ?? emp.pinCode ?? "",
    emergencyName: emp.emergencyName ?? "",
    emergencyRelationship: emp.emergencyRelationship ?? "",
    emergencyPhone: emp.emergencyPhone ?? "",
    raw: emp
  };
}

function renderEmployees() {
  const tbody = el("employeeTableBody");
  if (!tbody) return;
  const q = value("employeeSearch").toLowerCase();
  const dep = value("employeeDepartmentFilter");
  const status = value("employeeStatusFilter");
  const list = employees.filter(e => {
    const searchText = [e.name, e.employeeId, e.email, e.phone, displayDepartment(e), displayDesignation(e)].join(" ").toLowerCase();
    return (!q || searchText.includes(q)) && (!dep || String(displayDepartment(e)) === dep) && (!status || String(e.status) === status);
  });
  text("employeeCount", list.length);
  if (!list.length) { tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4">No employees found.</td></tr>'; return; }
  tbody.innerHTML = list.map(e => {
    const name = e.name || `${e.firstName || ""} ${e.lastName || ""}`.trim() || "Unnamed Employee";
    const statusText = e.status || "Active";
    return `<tr>
      <td><div class="d-flex align-items-center gap-2"><div class="avatar">${escapeHTML(name.charAt(0).toUpperCase())}</div><strong>${escapeHTML(name)}</strong></div></td>
      <td>${escapeHTML(e.employeeId ?? e.id)}</td>
      <td>${escapeHTML(displayDepartment(e))}</td>
      <td>${escapeHTML(displayDesignation(e))}</td>
      <td>${escapeHTML(e.email || "-")}</td>
      <td><span class="badge ${String(statusText).toLowerCase() === "inactive" ? "bg-secondary" : "bg-success"}">${escapeHTML(statusText)}</span></td>
      <td class="text-center"><a class="btn btn-sm btn-outline-primary me-1" href="employee-details.html?id=${encodeURIComponent(e.id)}">View</a><a class="btn btn-sm btn-outline-warning me-1" href="edit-employee.html?id=${encodeURIComponent(e.id)}">Edit</a><button class="btn btn-sm btn-outline-danger" onclick="deleteEmployee(${JSON.stringify(e.id)})">Delete</button></td>
    </tr>`;
  }).join("");
}

function displayDepartment(e) { return lookupMasterName(e.department, ["Department", "department"]) || e.department || "-"; }
function displayDesignation(e) { return lookupMasterName(e.designation, ["Designation", "designation"]) || e.designation || "-"; }
function displayCompany(e) {
  if (e.company === "" || e.company == null) return "-";
  const c = companies.find(x => String(x.id) === String(e.company) || String(x.companyId) === String(e.company));
  return c ? (c.name || c.companyName) : e.company;
}
function lookupMasterName(id, types = []) {
  const m = masterData.find(x => String(x.id) === String(id) && (!types.length || types.some(t => String(x.type).toLowerCase() === t.toLowerCase())));
  return m ? m.name : "";
}

function initEmployeeFilters() {
  ["employeeSearch", "employeeDepartmentFilter", "employeeStatusFilter"].forEach(id => {
    const e = el(id); if (e && e.dataset.bound !== "1") { e.dataset.bound = "1"; e.addEventListener(id === "employeeSearch" ? "input" : "change", renderEmployees); }
  });
  const filter = el("employeeDepartmentFilter");
  if (filter && filter.options.length <= 1) {
    const deps = [...new Set(employees.map(displayDepartment).filter(Boolean))];
    deps.forEach(d => filter.appendChild(new Option(d, d)));
  }
}

/* =========================================================
   EMPLOYEE DROPDOWNS / MASTER VALUES
   ========================================================= */
function extractOptionList(data, keywords = []) {
  const found = [];
  const seen = new Set();
  function visit(node, keyName = "") {
    if (!node) return;
    if (Array.isArray(node)) { node.forEach(x => visit(x, keyName)); return; }
    if (typeof node !== "object") return;
    const lowerKey = String(keyName).toLowerCase();
    const matchesKey = keywords.some(k => lowerKey.includes(k.toLowerCase()));
    const id = node.id ?? node.masterId ?? node.departmentId ?? node.designationId ?? node.companyId ?? node.valueId;
    const name = node.name ?? node.masterName ?? node.departmentName ?? node.designationName ?? node.companyName ?? node.value ?? node.text ?? node.label;
    if (matchesKey && id != null && name != null) {
      const key = `${id}|${name}`;
      if (!seen.has(key)) { seen.add(key); found.push({ id, name }); }
    }
    Object.entries(node).forEach(([k, v]) => visit(v, k));
  }
  visit(data);
  return found;
}

function getMasterOptions(type) {
  const normalized = type.toLowerCase();
  const fromLocal = masterData.filter(m => String(m.type).toLowerCase() === normalized && m.id != null).map(m => ({ id: m.id, name: m.name }));
  if (fromLocal.length) return fromLocal;
  const keywordMap = {
    department: ["department", "departments"],
    designation: ["designation", "designations", "post"],
    company: ["company", "companies"]
  };
  return extractOptionList(dropdownMasters, keywordMap[normalized] || [normalized]);
}

function populateSelect(id, options, placeholder, keepValue = true) {
  const select = el(id); if (!select) return;
  const old = keepValue ? select.value : "";
  select.innerHTML = "";
  select.appendChild(new Option(placeholder, ""));
  options.forEach(o => select.appendChild(new Option(o.name, o.id)));
  if (old) select.value = old;
}

function populateEmployeeDropdowns(prefix) {
  const companyId = `${prefix}Company`;
  const departmentId = `${prefix}Department`;
  const designationId = `${prefix}Designation`;
  populateSelect(companyId, companies.map(c => ({ id: c.id ?? c.companyId, name: c.name ?? c.companyName })), "Select Company");
  let deps = getMasterOptions("department");
  let desigs = getMasterOptions("designation");

  // If the master endpoint has a different response shape, use valid numeric
  // department/designation IDs already returned by GetEmployees as a fallback.
  if (!deps.length) {
    deps = [...new Set(employees.map(e => e.department).filter(v => /^\d+$/.test(String(v))))]
      .map(id => ({ id: Number(id), name: `Department ${id}` }));
  }
  if (!desigs.length) {
    desigs = [...new Set(employees.map(e => e.designation).filter(v => /^\d+$/.test(String(v))))]
      .map(id => ({ id: Number(id), name: `Designation ${id}` }));
  }

  if (deps.length) populateSelect(departmentId, deps, "Select Department");
  if (desigs.length) populateSelect(designationId, desigs, "Select Designation");
}

/* =========================================================
   EMPLOYEE REGISTER
   ========================================================= */
function dateOrNow(id) {
  const v = value(id);
  return v ? new Date(v).toISOString() : todayISO();
}

function calculateAge(dateString) {
  if (!dateString) return 0;
  const dob = new Date(dateString);
  if (Number.isNaN(dob.getTime())) return 0;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const month = now.getMonth() - dob.getMonth();
  if (month < 0 || (month === 0 && now.getDate() < dob.getDate())) age--;
  return Math.max(age, 0);
}

function buildEmployeePayload() {
  const numeric = id => { const n = Number(value(id)); return Number.isFinite(n) ? n : 0; };
  return {
    rlBand: 0, proofName: "", childrenPension: "", widowPension: "",
    employeeId: numeric("employeeId"), postAppliedFor: 0,
    fullName: `${value("employeeFirstName")} ${value("employeeLastName")}`.trim(),
    motherName: "", fatherOrHusbandName: "",
    dateOfBirth: dateOrNow("employeeDob"), age: calculateAge(value("employeeDob")),
    maritalStatus: "", gender: value("employeeGender"), nationality: "", religion: "", weight: "", caste: "", region: "", bloodGroup: "", identityMark: "", shiftType: "", shiftOption: 0,
    presentAddress: value("employeeAddress"), permanentAddress: value("employeeAddress"),
    aadharNo: "", panCardNo: "", pfUanNo: "", workerLwfNo: "", payCode: "", cardNo: "", entryDate: todayISO(),
    designation: Number(value("employeeDesignation")) || 0,
    department: Number(value("employeeDepartment")) || 0,
    company: Number(value("employeeCompany")) || 0,
    location: value("employeeLocation"), subDepartment: 0, category: 0, cadre: 0, division: 0, appointmentMonths: 0,
    bankName: "", bankAccountNo: "", bankBranch: "", bankIfscCode: "", costCentre: 0, transferFrom: 0, transferTo: 0,
    transferDate: todayISO(), reportingDate: todayISO(), subDivision: "", salary: 0, confirmDate: todayISO(),
    employmentStatus: value("employeeStatus") || "Active", interviewDate: todayISO(), interviewedBy: "",
    address: value("employeeAddress"), reference: "", relativeWorkingInCompany: false, relativeName: "", relativeRelationship: "",
    esiNo: "", pfNo: "", uanNo: "", dateOfJoining: dateOrNow("employeeJoiningDate"), approvedBy: "", totalExperienceYears: 0,
    languagesKnown: "", whatsappNo: value("employeePhone"), email: value("employeeEmail"), phone1: value("employeePhone"), phone2: "",
    qualification: "", technicalQualification: "", pincode: value("employeePostalCode"), state: 0, district: 0,
    aadharAttachment: false, panCardAttachment: false, bankPassbookAttachment: false, educationAttachment: false, experienceAttachment: false, photoAttachment: false,
    numPhotos: 0, sunHdPayEnabled: false, nightRate: 0, otRate: 0, rate: 0, foodingEnabled: false, overtimeEnabled: false,
    employeeType: value("employeeType"), wageCalculationType: "", paymentType: "", ctc: 0, basicSalary: 0, hra: 0, allowance: 0, deduction: 0,
    transportFacility: false, routeNo: "", remarks: "", employeeFamilyMembers: [], employeeExperiences: []
  };
}

function validateEmployeePayload(p) {
  const missing = [];
  if (!p.fullName) missing.push("Full Name");
  if (!p.employeeId) missing.push("numeric Employee ID");
  if (!p.company) missing.push("Company");
  if (!p.department) missing.push("numeric Department ID");
  if (!p.designation) missing.push("numeric Designation ID");
  if (!p.email) missing.push("Email");
  if (!p.phone1) missing.push("Phone");
  if (missing.length) {
    alert(`Please provide: ${missing.join(", ")}.`);
    return false;
  }
  return true;
}

function initAddEmployeeForm() {
  const form = el("addEmployeeForm");
  if (!form || form.dataset.bound === "1") return;
  form.dataset.bound = "1";
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const payload = buildEmployeePayload();
    if (!validateEmployeePayload(payload)) return;
    try {
      await addEmployeeToAPI(payload);
      form.reset();
      window.location.href = "employees.html";
    } catch (err) {
      console.error(err);
      alert(err.message || "Unable to add employee.");
    }
  });
}

async function addEmployeeToAPI(employeeData) {
  try {
    const data = await fetchJSON(`${EMPLOYEE_API_URL}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(employeeData)
    });
    return data;
  } catch (err) {
    // Keep a local copy only for network failures. API validation errors must be shown.
    if (err.status && err.status >= 400 && err.status < 500) throw err;
    const localId = employeeData.employeeId || Date.now();
    const local = normalizeEmployee({ ...employeeData, employeeId: localId, dateOfJoining: employeeData.dateOfJoining }, localId);
    employees.push(local); saveLocalData();
    alert("API could not be reached. Employee was saved locally on this browser.");
    return local;
  }
}

/* =========================================================
   EMPLOYEE EDIT / DETAILS / DELETE
   ========================================================= */
function loadEditEmployee() {
  const id = new URLSearchParams(window.location.search).get("id");
  if (!id) return;
  const employee = employees.find(e => String(e.id) === String(id) || String(e.employeeId) === String(id));
  if (!employee) { alert("Employee not found."); return; }

  setValue("editEmployeeDatabaseId", employee.id);
  const name = employee.name || employee.fullName || "";
  const parts = name.trim().split(/\s+/);
  setValue("editFirstName", employee.firstName || parts.shift() || "");
  setValue("editLastName", employee.lastName || parts.join(" "));
  setValue("editEmail", employee.email); setValue("editPhone", employee.phone || employee.phone1);
  setValue("editDob", toDateInput(employee.dateOfBirth)); setValue("editGender", employee.gender);
  setValue("editEmployeeId", employee.employeeId); setSelectOrText("editCompany", employee.company);
  setSelectOrText("editDepartment", employee.department); setSelectOrText("editDesignation", employee.designation);
  setValue("editEmploymentType", employee.employeeType || employee.employmentType); setValue("editJoiningDate", toDateInput(employee.joiningDate));
  setValue("editLocation", employee.location); setValue("editStatus", employee.status || employee.employmentStatus);
  setValue("editAddress", employee.address || employee.presentAddress); setValue("editCity", employee.city); setValue("editProvince", employee.province); setValue("editPostalCode", employee.pincode);
  setValue("editEmergencyName", employee.emergencyName); setValue("editEmergencyRelationship", employee.emergencyRelationship); setValue("editEmergencyPhone", employee.emergencyPhone);

  const form = el("editEmployeeForm");
  if (form && form.dataset.bound !== "1") {
    form.dataset.bound = "1";
    form.addEventListener("submit", e => {
      e.preventDefault();
      updateEmployeeLocally(value("editEmployeeDatabaseId"));
    });
  }
}

function toDateInput(v) { if (!v) return ""; const d = new Date(v); return Number.isNaN(d.getTime()) ? String(v).slice(0, 10) : d.toISOString().slice(0, 10); }
function setSelectOrText(id, v) {
  const e = el(id); if (!e) return;
  const s = String(v ?? "");
  if ([...e.options].some(o => String(o.value) === s)) e.value = s;
  else if (s) { const opt = new Option(s, s); e.appendChild(opt); e.value = s; }
}

function updateEmployeeLocally(id) {
  const employee = employees.find(e => String(e.id) === String(id));
  if (!employee) return alert("Employee not found.");
  const first = value("editFirstName"), last = value("editLastName");
  const updated = {
    ...employee,
    firstName: first, lastName: last, name: `${first} ${last}`.trim(), fullName: `${first} ${last}`.trim(),
    employeeId: Number(value("editEmployeeId")) || value("editEmployeeId"),
    email: value("editEmail"), phone: value("editPhone"), phone1: value("editPhone"),
    dateOfBirth: value("editDob"), gender: value("editGender"), company: value("editCompany"), department: value("editDepartment"), designation: value("editDesignation"),
    employeeType: value("editEmploymentType"), joiningDate: value("editJoiningDate"), dateOfJoining: value("editJoiningDate"), location: value("editLocation"),
    status: value("editStatus"), employmentStatus: value("editStatus"), address: value("editAddress"), presentAddress: value("editAddress"), city: value("editCity"), province: value("editProvince"), pincode: value("editPostalCode"),
    emergencyName: value("editEmergencyName"), emergencyRelationship: value("editEmergencyRelationship"), emergencyPhone: value("editEmergencyPhone")
  };
  const overrides = getEmployeeOverrides(); overrides[String(id)] = updated; saveEmployeeOverrides(overrides);
  const idx = employees.findIndex(e => String(e.id) === String(id)); employees[idx] = updated; saveLocalData();
  alert("Employee updated successfully on this browser. The EmployeeOnboarding API does not expose a verified update endpoint in the supplied API contract.");
  window.location.href = "employees.html";
}

function deleteEmployee(id) { selectedEmployeeId = id; showModal("deleteEmployeeModal"); }
function confirmDeleteEmployee() {
  if (selectedEmployeeId == null) return;
  const deleted = getDeletedEmployees(); if (!deleted.map(String).includes(String(selectedEmployeeId))) deleted.push(selectedEmployeeId); saveDeletedEmployees(deleted);
  employees = employees.filter(e => String(e.id) !== String(selectedEmployeeId)); saveLocalData();
  hideModal("deleteEmployeeModal"); selectedEmployeeId = null; renderEmployees();
}

function loadEmployeeDetails() {
  const id = new URLSearchParams(window.location.search).get("id");
  const e = employees.find(x => String(x.id) === String(id) || String(x.employeeId) === String(id));
  if (!e) { text("employeeName", "Employee Not Found"); return; }
  const name = e.name || e.fullName || `${e.firstName || ""} ${e.lastName || ""}`.trim() || "Unnamed Employee";
  text("employeeAvatar", name.charAt(0).toUpperCase()); text("employeeName", name); text("employeeDesignation", displayDesignation(e));
  const status = e.status || "Active"; const statusEl = el("employeeStatus"); if (statusEl) { statusEl.textContent = status; statusEl.className = `badge ${String(status).toLowerCase() === "inactive" ? "bg-secondary" : "bg-success"}`; }
  text("detailEmployeeId", e.employeeId ?? e.id); text("detailEmail", e.email || "-"); text("detailPhone", e.phone || e.phone1 || "-"); text("detailDob", formatDate(e.dateOfBirth)); text("detailGender", e.gender || "-");
  text("detailCompany", displayCompany(e)); text("detailDepartment", displayDepartment(e)); text("detailDesignation", displayDesignation(e)); text("detailEmploymentType", e.employeeType || e.employmentType || "-"); text("detailJoiningDate", formatDate(e.joiningDate)); text("detailLocation", e.location || "-");
  text("detailAddress", e.address || e.presentAddress || "-"); text("detailCity", e.city || "-"); text("detailProvince", e.province || "-"); text("detailPostalCode", e.pincode || "-");
  text("detailEmergencyName", e.emergencyName || "-"); text("detailEmergencyRelationship", e.emergencyRelationship || "-"); text("detailEmergencyPhone", e.emergencyPhone || "-");
  const edit = el("editEmployeeButton"); if (edit) edit.href = `edit-employee.html?id=${encodeURIComponent(e.id)}`;
}

/* =========================================================
   DASHBOARD
   ========================================================= */
function updateDashboardStats() {
  text("dashboardEmployees", employees.length); text("dashboardCompanies", companies.length);
  const total = employees.length; const completed = onboardingData.filter(o => o.status === "Completed").length;
  text("dashboardOnboarding", total ? `${Math.round((completed / total) * 100)}%` : "0%");
  text("dashboardDocuments", employeeDocuments.length);
}
function renderRecentEmployees() {
  const tbody = el("recentEmployees"); if (!tbody) return;
  const list = employees.slice(-5).reverse();
  tbody.innerHTML = list.length ? list.map(e => `<tr><td>${escapeHTML(e.name || e.fullName || "-")}</td><td>${escapeHTML(displayDepartment(e))}</td><td>${escapeHTML(displayDesignation(e))}</td><td>${escapeHTML(formatDate(e.joiningDate))}</td><td><span class="badge bg-success">${escapeHTML(e.status || "Active")}</span></td></tr>`).join("") : '<tr><td colspan="5" class="text-center">No employees found.</td></tr>';
}

/* =========================================================
   ONBOARDING
   ========================================================= */
function initOnboarding() {
  ["onboardingSearch", "onboardingStatusFilter"].forEach(id => {
    const e = el(id); if (e && e.dataset.bound !== "1") { e.dataset.bound = "1"; e.addEventListener(id === "onboardingSearch" ? "input" : "change", renderOnboarding); }
  });
}
function getOnboardingRecord(id) {
  let r = onboardingData.find(x => String(x.employeeId) === String(id));
  if (!r) { r = { employeeId: id, documents: false, account: false, equipment: false, orientation: false, training: false, status: "Pending" }; onboardingData.push(r); saveLocalData(); }
  return r;
}
function onboardingProgress(r) { const tasks = ["documents", "account", "equipment", "orientation", "training"]; return Math.round(tasks.filter(k => r[k]).length / tasks.length * 100); }
function onboardingStatus(r) { const p = onboardingProgress(r); return p === 100 ? "Completed" : p > 0 ? "In Progress" : "Pending"; }
function renderOnboarding() {
  const tbody = el("onboardingTableBody"); if (!tbody) return;
  const q = value("onboardingSearch").toLowerCase(); const filter = value("onboardingStatusFilter");
  const rows = employees.map(e => { const r = getOnboardingRecord(e.id); r.status = onboardingStatus(r); return { e, r }; }).filter(({e,r}) => (!q || [e.name,e.employeeId,e.email].join(" ").toLowerCase().includes(q)) && (!filter || r.status === filter));
  const completed = rows.filter(x => x.r.status === "Completed").length; const progress = rows.filter(x => x.r.status === "In Progress").length;
  text("totalOnboarding", rows.length); text("completedOnboarding", completed); text("progressOnboarding", progress); text("pendingOnboarding", rows.length - completed - progress);
  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4">No onboarding records found.</td></tr>'; return; }
  tbody.innerHTML = rows.map(({e,r}) => `<tr><td>${escapeHTML(e.name || e.fullName || "-")}</td><td>${escapeHTML(e.employeeId ?? e.id)}</td><td><div class="progress" style="height:8px"><div class="progress-bar" style="width:${onboardingProgress(r)}%"></div></div><small>${onboardingProgress(r)}%</small></td><td><span class="badge ${r.status === "Completed" ? "bg-success" : r.status === "In Progress" ? "bg-warning text-dark" : "bg-secondary"}">${r.status}</span></td><td><button class="btn btn-sm btn-primary" onclick="openOnboardingChecklist(${JSON.stringify(e.id)})">Checklist</button></td></tr>`).join("");
  saveLocalData();
}
function openOnboardingChecklist(id) {
  onboardingEmployeeId = id; const e = employees.find(x => String(x.id) === String(id)); const r = getOnboardingRecord(id); if (!e) return;
  text("modalEmployeeName", e.name || e.fullName || "Employee"); text("modalEmployeeDetails", `${e.employeeId ?? e.id} • ${displayDesignation(e)}`);
  document.querySelectorAll(".onboarding-task").forEach(cb => { cb.checked = !!r[cb.dataset.task]; }); updateOnboardingModalProgress(); showModal("onboardingModal");
}
function updateOnboardingModalProgress() { const tasks = [...document.querySelectorAll(".onboarding-task")]; const p = tasks.length ? Math.round(tasks.filter(x => x.checked).length / tasks.length * 100) : 0; text("modalProgress", `${p}%`); const bar = el("modalProgressBar"); if (bar) bar.style.width = `${p}%`; }
function saveOnboardingProgress() {
  if (onboardingEmployeeId == null) return; const r = getOnboardingRecord(onboardingEmployeeId); document.querySelectorAll(".onboarding-task").forEach(cb => r[cb.dataset.task] = cb.checked); r.status = onboardingStatus(r); saveLocalData(); hideModal("onboardingModal"); renderOnboarding();
}

/* =========================================================
   DOCUMENTS
   ========================================================= */
function populateDocumentEmployeeDropdown() {
  const select = el("documentEmployee"); if (!select) return;
  const old = select.value; select.innerHTML = ""; select.appendChild(new Option("Select Employee", ""));
  employees.forEach(e => select.appendChild(new Option(`${e.name || e.fullName || "Employee"} (${e.employeeId ?? e.id})`, e.id)));
  if (old) select.value = old;
}
function openDocumentModal() {
  editingDocumentId = null; setValue("documentId", ""); setValue("documentEmployee", ""); setValue("documentType", ""); setValue("documentNumber", ""); setValue("documentDate", new Date().toISOString().slice(0,10)); setValue("documentStatus", "Pending"); text("documentModalTitle", "Add Document"); populateDocumentEmployeeDropdown(); showModal("documentModal");
}
function initDocuments() {
  const form = el("documentForm");
  if (form && form.dataset.bound !== "1") { form.dataset.bound = "1"; form.addEventListener("submit", e => { e.preventDefault(); saveDocument(); }); }
  const search = el("documentSearch"); if (search && search.dataset.bound !== "1") { search.dataset.bound = "1"; search.addEventListener("input", renderDocuments); }
  const filter = el("documentStatusFilter"); if (filter && filter.dataset.bound !== "1") { filter.dataset.bound = "1"; filter.addEventListener("change", renderDocuments); }
}
function renderDocuments() {
  const tbody = el("documentsTableBody"); if (!tbody) return;
  const q = value("documentSearch").toLowerCase(), filter = value("documentStatusFilter");
  const list = employeeDocuments.filter(d => { const e = employees.find(x => String(x.id) === String(d.employeeId)); const name = e ? (e.name || e.fullName) : d.employeeName || ""; return (!q || `${name} ${d.documentType} ${d.documentNumber}`.toLowerCase().includes(q)) && (!filter || d.status === filter); });
  text("totalDocuments", employeeDocuments.length); text("uploadedDocuments", employeeDocuments.filter(d => d.status === "Uploaded").length); text("verifiedDocuments", employeeDocuments.filter(d => d.status === "Verified").length); text("pendingDocuments", employeeDocuments.filter(d => d.status === "Pending").length);
  if (!list.length) { tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4">No documents found.</td></tr>'; return; }
  tbody.innerHTML = list.map(d => { const e = employees.find(x => String(x.id) === String(d.employeeId)); const name = e ? (e.name || e.fullName) : d.employeeName || "-"; return `<tr><td>${escapeHTML(name)}</td><td>${escapeHTML(d.documentType)}</td><td>${escapeHTML(d.documentNumber || "-")}</td><td>${escapeHTML(formatDate(d.date))}</td><td><span class="badge ${d.status === "Verified" ? "bg-success" : d.status === "Rejected" ? "bg-danger" : d.status === "Uploaded" ? "bg-primary" : "bg-secondary"}">${escapeHTML(d.status)}</span></td><td><button class="btn btn-sm btn-warning me-1" onclick="editDocument(${JSON.stringify(d.id)})">Edit</button><button class="btn btn-sm btn-danger" onclick="deleteDocument(${JSON.stringify(d.id)})">Delete</button></td></tr>`; }).join("");
}
function saveDocument() {
  const employeeId = value("documentEmployee"), documentType = value("documentType"); if (!employeeId || !documentType) return alert("Please select employee and document type.");
  const record = { id: editingDocumentId ?? Date.now(), employeeId, documentType, documentNumber: value("documentNumber"), date: value("documentDate"), status: value("documentStatus") || "Pending" };
  const i = employeeDocuments.findIndex(x => String(x.id) === String(record.id)); if (i >= 0) employeeDocuments[i] = record; else employeeDocuments.push(record); saveLocalData(); hideModal("documentModal"); renderDocuments();
}
function editDocument(id) { const d = employeeDocuments.find(x => String(x.id) === String(id)); if (!d) return; editingDocumentId = id; populateDocumentEmployeeDropdown(); setValue("documentId", d.id); setValue("documentEmployee", d.employeeId); setValue("documentType", d.documentType); setValue("documentNumber", d.documentNumber); setValue("documentDate", d.date); setValue("documentStatus", d.status); text("documentModalTitle", "Edit Document"); showModal("documentModal"); }
function deleteDocument(id) { selectedDocumentId = id; showModal("deleteDocumentModal"); }
function confirmDeleteDocument() { if (selectedDocumentId == null) return; employeeDocuments = employeeDocuments.filter(x => String(x.id) !== String(selectedDocumentId)); saveLocalData(); hideModal("deleteDocumentModal"); selectedDocumentId = null; renderDocuments(); }

/* =========================================================
   COMMON MODAL / LIVE UI
   ========================================================= */
function closeModal(id) { hideModal(id); }
document.addEventListener("change", e => { if (e.target.classList.contains("onboarding-task")) updateOnboardingModalProgress(); });

/* =========================================================
   GLOBAL FUNCTIONS USED BY INLINE HTML
   ========================================================= */
window.logout = logout;
window.openCompanyModal = openCompanyModal;
window.confirmDeleteCompany = confirmDeleteCompany;
window.deleteCompany = deleteCompany;
window.openMasterModal = openMasterModal;
window.editMaster = editMaster;
window.deleteMaster = deleteMaster;
window.confirmDeleteMaster = confirmDeleteMaster;
window.deleteEmployee = deleteEmployee;
window.confirmDeleteEmployee = confirmDeleteEmployee;
window.openOnboardingChecklist = openOnboardingChecklist;
window.saveOnboardingProgress = saveOnboardingProgress;
window.openDocumentModal = openDocumentModal;
window.editDocument = editDocument;
window.deleteDocument = deleteDocument;
window.confirmDeleteDocument = confirmDeleteDocument;
window.closeModal = closeModal;
