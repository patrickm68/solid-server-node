/* Provide functionality for authentication buttons */

(({ auth }) => {
  // Wire up DOM elements
  const [loginButton, logoutButton, registerButton, accountSettings] =
    ['login', 'logout', 'register', 'account-settings'].map(id =>
      document.getElementById(id) || document.createElement('a'))
  loginButton.addEventListener('click', login)
  logoutButton.addEventListener('click', logout)
  registerButton.addEventListener('click', register)

  // Track authentication status and update UI
  auth.trackSession(session => {
    const loggedIn = !!session
    const isOwner = loggedIn && new URL(session.webId).origin === location.origin
    loginButton.classList.toggle('hidden', loggedIn)
    logoutButton.classList.toggle('hidden', !loggedIn)
    registerButton.classList.toggle('hidden', loggedIn)
    accountSettings.classList.toggle('hidden', !isOwner)
  })

  // Log the user in on the client and the server
  async function login () {
    const session = await auth.popupLogin()
    if (session) {
      // Make authenticated request to the server to establish a session cookie
      const {status} = await auth.fetch(location, { method: 'HEAD' })
      if (status === 401) {
        alert(`Invalid login.\n\nDid you set ${session.idp} as your OIDC provider in your profile ${session.webId}?`)
        await auth.logout()
      }
      // Now that we have a cookie, reload to display the authenticated page
      location.reload()
    }
  }

  // Log the user out from the client and the server
  async function logout () {
    await auth.logout()
    location.reload()
  }

  // Redirect to the registration page
  function register () {
    const registration = new URL('/register', location)
    registration.searchParams.set('returnToUrl', location)
    location.href = registration
  }
})(solid)
