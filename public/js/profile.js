let currentProfile = null;
let profileInitialized = false;
let pendingQrCode = null;
let pendingSecret = null;

function resetProfile() {
  profileInitialized = false;
  pendingQrCode = null;
  pendingSecret = null;
}

async function loadProfile() {
  try {
    currentProfile = await API.getProfile();
    displayProfile(currentProfile);
  } catch (err) {
    if (err.message === 'Unauthorized' || err.message === 'Session expired') {
      location.reload();
    }
  }
}

function displayProfile(profile) {
  document.getElementById('profileEmail').textContent = profile.email;
  if (profile.twoFactorEnabled) {
    document.getElementById('twoFactorDisabled').style.display = 'none';
    document.getElementById('twoFactorSetup').style.display = 'none';
    document.getElementById('twoFactorEnabled').style.display = 'block';
  } else if (pendingQrCode) {
    document.getElementById('twoFactorEnabled').style.display = 'none';
    document.getElementById('twoFactorDisabled').style.display = 'none';
    document.getElementById('twoFactorSetup').style.display = 'block';
  } else {
    document.getElementById('twoFactorEnabled').style.display = 'none';
    document.getElementById('twoFactorSetup').style.display = 'none';
    document.getElementById('twoFactorDisabled').style.display = 'block';
  }
}

function initProfile() {
  if (profileInitialized) {
    loadProfile();
    return;
  }
  profileInitialized = true;

  loadProfile().then(() => {
    if (pendingQrCode) {
      document.getElementById('twoFactorQR').src = pendingQrCode;
      document.getElementById('twoFactorSecret').textContent = pendingSecret;
    }
  });

  document.getElementById('updateEmailBtn').addEventListener('click', async () => {
    const email = document.getElementById('emailInput').value.trim();
    const msg = document.getElementById('emailMsg');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      msg.textContent = 'Valid email required';
      msg.className = 'profile-msg error';
      return;
    }
    try {
      const res = await API.updateEmail(email);
      msg.textContent = 'Email updated successfully';
      msg.className = 'profile-msg success';
      currentProfile.email = email;
      document.getElementById('profileEmail').textContent = email;
      document.getElementById('emailInput').value = '';
      setTimeout(() => msg.textContent = '', 3000);
    } catch (err) {
      msg.textContent = err.message || 'Failed to update email';
      msg.className = 'profile-msg error';
    }
  });

  document.getElementById('changePassBtn').addEventListener('click', async () => {
    const current = document.getElementById('currentPass').value;
    const newPass = document.getElementById('newPass').value;
    const confirm = document.getElementById('confirmPass').value;
    const msg = document.getElementById('passwordMsg');
    if (!current || !newPass) {
      msg.textContent = 'Fill in all password fields';
      msg.className = 'profile-msg error';
      return;
    }
    if (newPass.length < 8) {
      msg.textContent = 'New password must be at least 8 characters';
      msg.className = 'profile-msg error';
      return;
    }
    if (newPass !== confirm) {
      msg.textContent = 'New passwords do not match';
      msg.className = 'profile-msg error';
      return;
    }
    try {
      await API.changePassword(current, newPass);
      msg.textContent = 'Password changed successfully';
      msg.className = 'profile-msg success';
      document.getElementById('currentPass').value = '';
      document.getElementById('newPass').value = '';
      document.getElementById('confirmPass').value = '';
      setTimeout(() => msg.textContent = '', 3000);
    } catch (err) {
      msg.textContent = err.message || 'Failed to change password';
      msg.className = 'profile-msg error';
    }
  });

  document.getElementById('setup2FABtn').addEventListener('click', async () => {
    const msg = document.getElementById('twoFactorMsg');
    try {
      const res = await API.setup2FA();
      pendingQrCode = res.qrCode;
      pendingSecret = res.secret;
      document.getElementById('twoFactorQR').src = res.qrCode;
      document.getElementById('twoFactorSecret').textContent = res.secret;
      document.getElementById('twoFactorDisabled').style.display = 'none';
      document.getElementById('twoFactorSetup').style.display = 'block';
      msg.textContent = '';
    } catch (err) {
      msg.textContent = err.message || 'Failed to setup 2FA';
      msg.className = 'profile-msg error';
    }
  });

  document.getElementById('verify2FABtn').addEventListener('click', async () => {
    const token = document.getElementById('twoFactorSetupCode').value.trim();
    const msg = document.getElementById('twoFactorMsg');
    if (!token || token.length !== 6) {
      msg.textContent = 'Enter a valid 6-digit code';
      msg.className = 'profile-msg error';
      return;
    }
    try {
      const res = await API.verify2FA(token);
      msg.textContent = res.message || '2FA enabled successfully';
      msg.className = 'profile-msg success';
      document.getElementById('twoFactorSetup').style.display = 'none';
      document.getElementById('twoFactorEnabled').style.display = 'block';
      currentProfile.twoFactorEnabled = true;
      pendingQrCode = null;
      pendingSecret = null;
      setTimeout(() => msg.textContent = '', 3000);
    } catch (err) {
      msg.textContent = err.message || 'Invalid code';
      msg.className = 'profile-msg error';
    }
  });

  document.getElementById('disable2FABtn').addEventListener('click', async () => {
    const value = document.getElementById('disable2FAPass').value.trim();
    const msg = document.getElementById('disable2FAMsg');
    if (!value) {
      msg.textContent = 'Enter your password or 2FA code to disable';
      msg.className = 'profile-msg error';
      return;
    }
    try {
      await API.disable2FA(value);
      msg.textContent = '2FA disabled successfully';
      msg.className = 'profile-msg success';
      document.getElementById('twoFactorEnabled').style.display = 'none';
      document.getElementById('twoFactorDisabled').style.display = 'block';
      document.getElementById('twoFactorQR').src = '';
      document.getElementById('twoFactorSetupCode').value = '';
      document.getElementById('disable2FAPass').value = '';
      currentProfile.twoFactorEnabled = false;
      pendingQrCode = null;
      pendingSecret = null;
      setTimeout(() => msg.textContent = '', 3000);
    } catch (err) {
      msg.textContent = err.message || 'Failed to disable 2FA';
      msg.className = 'profile-msg error';
    }
  });
}

window.resetProfile = resetProfile;

API.getProfile = function() {
  return this.request('GET', '/profile');
};
API.updateEmail = function(email) {
  return this.request('PUT', '/profile/email', { email });
};
API.changePassword = function(currentPassword, newPassword) {
  return this.request('PUT', '/profile/password', { currentPassword, newPassword });
};
API.setup2FA = function() {
  return this.request('POST', '/profile/2fa/setup');
};
API.verify2FA = function(token) {
  return this.request('POST', '/profile/2fa/verify', { token });
};
API.disable2FA = function(value) {
  const body = /^\d{6}$/.test(value) ? { token: value } : { password: value };
  return this.request('POST', '/profile/2fa/disable', body);
};
