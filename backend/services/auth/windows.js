const WindowsAuth = {
  async authenticate(config) {
    return {
      type: 'ntlm',
      options: {
        domain: config.domain || ''
      }
    };
  }
};

export default WindowsAuth;