/* ============================================================
   VALIDACIONES.JS — Cervecería Cocobongo
   Funciones de validación reutilizables del lado del cliente
   ============================================================ */

const Validaciones = (() => {

  /* ---- Reglas base ---- */
  const EMAIL_REGEX    = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;
  const PHONE_REGEX    = /^[0-9\s\+\-\(\)]{7,20}$/;
  const MIN_PASS_LEN   = 8;

  /* ---- Helpers DOM ---- */
  function setError(input, msg) {
    input.classList.remove('is-valid');
    input.classList.add('is-invalid');
    const errEl = document.getElementById(`${input.id}-error`);
    if (errEl) { errEl.textContent = msg; errEl.classList.add('visible'); }
  }

  function setValid(input) {
    input.classList.remove('is-invalid');
    input.classList.add('is-valid');
    const errEl = document.getElementById(`${input.id}-error`);
    if (errEl) errEl.classList.remove('visible');
  }

  function clearState(input) {
    input.classList.remove('is-valid', 'is-invalid');
    const errEl = document.getElementById(`${input.id}-error`);
    if (errEl) errEl.classList.remove('visible');
  }

  /* ---- Validadores individuales ---- */
  function validateRequired(input, label = 'Este campo') {
    if (!input.value.trim()) {
      setError(input, `${label} es obligatorio.`);
      return false;
    }
    setValid(input);
    return true;
  }

  function validateEmail(input) {
    if (!input.value.trim()) {
      setError(input, 'El correo electrónico es obligatorio.');
      return false;
    }
    if (!EMAIL_REGEX.test(input.value.trim())) {
      setError(input, 'Ingresa un correo electrónico válido.');
      return false;
    }
    setValid(input);
    return true;
  }

  function validatePassword(input) {
    if (!input.value) {
      setError(input, 'La contraseña es obligatoria.');
      return false;
    }
    if (input.value.length < MIN_PASS_LEN) {
      setError(input, `La contraseña debe tener al menos ${MIN_PASS_LEN} caracteres.`);
      return false;
    }
    setValid(input);
    return true;
  }

  function validatePositiveNumber(input, label = 'El valor') {
    const val = parseFloat(input.value);
    if (isNaN(val) || val <= 0) {
      setError(input, `${label} debe ser un número positivo.`);
      return false;
    }
    setValid(input);
    return true;
  }

  function validateMoney(input, label = 'El monto') {
    const val = parseFloat(input.value);
    if (isNaN(val) || val < 0) {
      setError(input, `${label} debe ser un valor monetario válido.`);
      return false;
    }
    if (!/^\d+(\.\d{1,2})?$/.test(input.value)) {
      setError(input, `${label} no puede tener más de 2 decimales.`);
      return false;
    }
    setValid(input);
    return true;
  }

  function validatePhone(input) {
    if (input.value && !PHONE_REGEX.test(input.value)) {
      setError(input, 'Ingresa un número de teléfono válido.');
      return false;
    }
    if (input.value) setValid(input);
    return true;
  }

  function validateSelect(input, label = 'Este campo') {
    if (!input.value || input.value === '' || input.value === '0') {
      setError(input, `Debes seleccionar ${label}.`);
      return false;
    }
    setValid(input);
    return true;
  }

  function validatePasswordMatch(input1, input2) {
    if (!validatePassword(input1)) return false;
    if (input1.value !== input2.value) {
      setError(input2, 'Las contraseñas no coinciden.');
      return false;
    }
    setValid(input2);
    return true;
  }

  /* ---- Validar formulario completo ---- */
  function validateForm(rules) {
    // rules: [{ type, input, label? }, ...]
    let valid = true;
    for (const rule of rules) {
      let ok = true;
      switch (rule.type) {
        case 'required': ok = validateRequired(rule.input, rule.label); break;
        case 'email':    ok = validateEmail(rule.input);                break;
        case 'password': ok = validatePassword(rule.input);             break;
        case 'number':   ok = validatePositiveNumber(rule.input, rule.label); break;
        case 'money':    ok = validateMoney(rule.input, rule.label);    break;
        case 'phone':    ok = validatePhone(rule.input);                break;
        case 'select':   ok = validateSelect(rule.input, rule.label);   break;
      }
      if (!ok) valid = false;
    }
    return valid;
  }

  /* ---- Live validation on blur ---- */
  function attachLiveValidation(inputEl, type, label) {
    inputEl.addEventListener('blur', () => {
      if (!inputEl.value) { clearState(inputEl); return; }
      validateForm([{ type, input: inputEl, label }]);
    });

    inputEl.addEventListener('input', () => {
      if (inputEl.classList.contains('is-invalid')) {
        clearState(inputEl);
      }
    });
  }

  return {
    validateRequired,
    validateEmail,
    validatePassword,
    validatePositiveNumber,
    validateMoney,
    validatePhone,
    validateSelect,
    validatePasswordMatch,
    validateForm,
    attachLiveValidation,
    setError,
    setValid,
    clearState
  };

})();
