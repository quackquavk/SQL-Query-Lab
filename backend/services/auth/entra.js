const EntraAuth = {
  client: null,

  async initiateDeviceFlow(config) {
    return {
      accessToken: null,
      refreshToken: null,
      expiresAt: Date.now()
    };
  },

  async refreshToken(config, refreshToken) {
    return {
      accessToken: null,
      expiresAt: Date.now()
    };
  },

  async getAccessToken(config) {
    return null;
  }
};

export default EntraAuth;