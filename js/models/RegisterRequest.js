/* ============================================================
   RegisterRequest — DTO alineado con backend RegisterRequest
   POST /api/v1/auth/register (RF-SEG-01)
   ============================================================ */

class RegisterRequest {

  constructor({ name, email, password, branchId }) {
    this.name     = (name || '').trim();
    this.email    = (email || '').trim();
    this.password = password || '';
    this.branchId = branchId != null && branchId !== ''
      ? Number(branchId)
      : null;
  }

  static fromForm(form) {
    const branchSelect = form.elements.namedItem('branchId');
    const branchManual = form.elements.namedItem('branchIdManual');
    const branchId = (branchSelect && !branchSelect.disabled && branchSelect.value)
      || (branchManual && branchManual.value)
      || null;

    return new RegisterRequest({
      name:     form.elements.namedItem('name')?.value,
      email:    form.elements.namedItem('email')?.value,
      password: form.elements.namedItem('password')?.value,
      branchId
    });
  }

  toJSON() {
    return {
      name:     this.name,
      email:    this.email,
      password: this.password,
      branchId: this.branchId
    };
  }

}
