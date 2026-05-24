// Wolf Game Cave Mapper - With Cloud Save & Crowdsourced Aggregation
// Version 3.0

(function() {
  var CM_SCRIPT_VERSION = 'diggable-density-zones-2026-05-17-2';
  if (window.caveMapperLoaded) {
    console.log('🐺 Cave Mapper already running!');
    return;
  }
  window.caveMapperLoaded = true;
  window.caveMapperScriptVersion = CM_SCRIPT_VERSION;

  // ==================== CONFIGURATION ====================
  // Replace these with your Supabase project values
  var SUPABASE_URL = 'https://ksvmfrtjczylsnucluia.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_NOLYviQdqkeQhRKYuD61eA_v95J4lvI';
  
  // Crowdsource settings
  var CROWDSOURCE_ENABLED = true;
  var AUTO_SUBMIT_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
  var AUTO_SUBMIT_TILE_THRESHOLD = 50; // Submit after X new tiles
  var KNOWN_SPAWN_POSITIONS = ['50,50']; // Starting spawn point for new runs
  var ROUTE_START_ENERGY = 200;
  var ROUTE_DIG_COST = 5;
  var ROUTE_WALL_BREAK_COST = 5;
  var ROUTE_DIAMOND_VALUE = 1;
  var ROUTE_DIGGABLE_VALUE = 0.65;
  var ROUTE_EXACT_TARGET_LIMIT = 16;
  var ROUTE_BEAM_TARGET_LIMIT = 9999;
  var ROUTE_BEAM_WIDTH = 1200;
  var ROUTE_CLUSTER_RADIUS = 10;
  var ROUTE_ZONE_RADIUS = 6;
  var ROUTE_ZONE_LIMIT = 5;
  var ROUTE_ZONE_MIN_DIAMONDS = 2;
  var ROUTE_ZONE_MIN_POINTS = 3;
  var ROUTE_ZONE_MIN_SCORE = 1.8;
  var ROUTE_ZONE_ENERGY_WEIGHT = 0.15;
  var ROUTE_ZONE_DIGGABLE_WEIGHT = 1;
  var ROUTE_MULTI_TARGET_LIMIT = 120;
  
  // ==================== SUPABASE CLIENT ====================
  var supabase = null;
  var currentUser = null;
  var accessToken = null;
  
  // Minimal Supabase client
  function initSupabase() {
    accessToken = localStorage.getItem('cm_access_token');
    var refreshToken = localStorage.getItem('cm_refresh_token');
    
    supabase = {
      auth: {
        getSession: async function() {
          if (!accessToken) return { data: { session: null } };
          try {
            var res = await fetch(SUPABASE_URL + '/auth/v1/user', {
              headers: { 'Authorization': 'Bearer ' + accessToken, 'apikey': SUPABASE_ANON_KEY }
            });
            if (res.ok) {
              var user = await res.json();
              currentUser = user;
              return { data: { session: { user: user, access_token: accessToken } } };
            } else {
              return await supabase.auth.refreshSession();
            }
          } catch (e) {
            return { data: { session: null }, error: e };
          }
        },
        refreshSession: async function() {
          var currentRefreshToken = localStorage.getItem('cm_refresh_token');
          if (!currentRefreshToken) return { data: { session: null } };
          try {
            var res = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
              body: JSON.stringify({ refresh_token: currentRefreshToken })
            });
            if (res.ok) {
              var data = await res.json();
              localStorage.setItem('cm_access_token', data.access_token);
              localStorage.setItem('cm_refresh_token', data.refresh_token);
              accessToken = data.access_token;
              currentUser = data.user;
              console.log('CM: Session refreshed successfully');
              return { data: { session: data } };
            } else {
              console.log('CM: Refresh failed, status:', res.status);
            }
          } catch (e) {
            console.log('CM: Refresh error:', e);
          }
          return { data: { session: null } };
        },
        signUp: async function(email, password) {
          try {
            var res = await fetch(SUPABASE_URL + '/auth/v1/signup', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
              body: JSON.stringify({ email: email, password: password })
            });
            var data = await res.json();
            if (data.access_token) {
              localStorage.setItem('cm_access_token', data.access_token);
              localStorage.setItem('cm_refresh_token', data.refresh_token);
              accessToken = data.access_token;
              currentUser = data.user;
            }
            return { data: data, error: data.error ? data : null };
          } catch (e) {
            return { error: e };
          }
        },
        signInWithPassword: async function(email, password) {
          try {
            var res = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
              body: JSON.stringify({ email: email, password: password })
            });
            var data = await res.json();
            if (data.access_token) {
              localStorage.setItem('cm_access_token', data.access_token);
              localStorage.setItem('cm_refresh_token', data.refresh_token);
              accessToken = data.access_token;
              currentUser = data.user;
              return { data: data };
            }
            return { error: data };
          } catch (e) {
            return { error: e };
          }
        },
        signInWithOAuth: function(provider) {
          return new Promise(function(resolve) {
            var callbackUrl = 'https://extension.wolfgamecavemapper.com/auth-callback.html';
            var url = SUPABASE_URL + '/auth/v1/authorize?provider=' + provider + '&redirect_to=' + encodeURIComponent(callbackUrl);
            
            var w = 500, h = 600;
            var left = Math.round((screen.width - w) / 2);
            var top = Math.round((screen.height - h) / 2);
            var popup = window.open(url, 'cm-oauth', 'width=' + w + ',height=' + h + ',left=' + left + ',top=' + top);
            
            if (!popup) {
              resolve({ error: { message: 'Popup blocked — please allow popups for this site.' } });
              return;
            }
            
            var resolved = false;
            
            function onMessage(event) {
              if (event.data && event.data.type === 'cm-oauth-callback') {
                if (resolved) return;
                resolved = true;
                window.removeEventListener('message', onMessage);
                clearInterval(pollClosed);
                
                if (event.data.access_token) {
                  localStorage.setItem('cm_access_token', event.data.access_token);
                  localStorage.setItem('cm_refresh_token', event.data.refresh_token);
                  accessToken = event.data.access_token;
                  
                  fetch(SUPABASE_URL + '/auth/v1/user', {
                    headers: { 'Authorization': 'Bearer ' + accessToken, 'apikey': SUPABASE_ANON_KEY }
                  }).then(function(r) { return r.json(); }).then(function(user) {
                    currentUser = user;
                    resolve({ data: { user: user, session: { access_token: accessToken } } });
                  }).catch(function(e) {
                    resolve({ error: e });
                  });
                } else {
                  resolve({ error: { message: event.data.error || 'OAuth failed' } });
                }
              }
            }
            
            window.addEventListener('message', onMessage);
            
            var pollClosed = setInterval(function() {
              try {
                if (popup.closed) {
                  clearInterval(pollClosed);
                  window.removeEventListener('message', onMessage);
                  if (!resolved) {
                    resolved = true;
                    resolve({ error: { message: 'Login window closed' } });
                  }
                }
              } catch (e) {}
            }, 1000);
          });
        },
        signOut: async function() {
          localStorage.removeItem('cm_access_token');
          localStorage.removeItem('cm_refresh_token');
          accessToken = null;
          currentUser = null;
        }
      },
      from: function(table) {
        return {
          select: function(columns) {
            this._select = columns || '*';
            return this;
          },
          insert: function(data) {
            this._insert = data;
            return this;
          },
          upsert: function(data) {
            this._upsert = data;
            return this;
          },
          delete: function() {
            this._delete = true;
            return this;
          },
          eq: function(col, val) {
            this._filters = this._filters || [];
            this._filters.push(col + '=eq.' + val);
            return this;
          },
          order: function(col, opts) {
            this._order = col + (opts && opts.ascending === false ? '.desc' : '.asc');
            return this;
          },
          limit: function(n) {
            this._limit = n;
            return this;
          },
          then: async function(resolve) {
            var url = SUPABASE_URL + '/rest/v1/' + table;
            var method = 'GET';
            var body = null;
            var headers = {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': 'Bearer ' + accessToken,
              'Content-Type': 'application/json',
              'Prefer': 'return=representation'
            };
            
            if (this._insert) {
              method = 'POST';
              body = JSON.stringify(this._insert);
            } else if (this._upsert) {
              method = 'POST';
              body = JSON.stringify(this._upsert);
              headers['Prefer'] = 'resolution=merge-duplicates,return=representation';
            } else if (this._delete) {
              method = 'DELETE';
            } else {
              var params = [];
              if (this._select) params.push('select=' + this._select);
              if (this._filters) params.push(this._filters.join('&'));
              if (this._order) params.push('order=' + this._order);
              if (this._limit) params.push('limit=' + this._limit);
              if (params.length) url += '?' + params.join('&');
            }
            
            if (this._filters && (this._insert || this._upsert || this._delete)) {
              url += '?' + this._filters.join('&');
            }
            
            try {
              var res = await fetch(url, { method: method, headers: headers, body: body });
              var data = await res.json();
              resolve({ data: Array.isArray(data) ? data : [data], error: res.ok ? null : data });
            } catch (e) {
              resolve({ data: null, error: e });
            }
          }
        };
      },
      rpc: async function(fnName, params) {
        try {
          var res = await fetch(SUPABASE_URL + '/rest/v1/rpc/' + fnName, {
            method: 'POST',
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': 'Bearer ' + accessToken,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(params || {})
          });
          var data = await res.json();
          return { data: data, error: res.ok ? null : data };
        } catch (e) {
          return { data: null, error: e };
        }
      }
    };
    
    // Check for OAuth callback
    var hash = window.location.hash;
    if (hash && hash.includes('access_token')) {
      var params = new URLSearchParams(hash.substring(1));
      var at = params.get('access_token');
      var rt = params.get('refresh_token');
      if (at) {
        localStorage.setItem('cm_access_token', at);
        localStorage.setItem('cm_refresh_token', rt);
        window.location.hash = '';
        window.location.reload();
      }
    }
  }
  
  initSupabase();

  // ==================== WALLET AUTH ====================
  async function walletAuth() {
    var provider = window.abstractWallet || window.ethereum;
    if (!provider) {
      return { error: { message: 'No wallet detected. Install Abstract Global Wallet or MetaMask.' } };
    }
    
    try {
      // Request wallet accounts
      var accounts = await provider.request({ method: 'eth_requestAccounts' });
      var address = accounts[0];
      
      // Build sign-in message with timestamp nonce
      var nonce = Date.now() + '-' + Math.random().toString(36).substring(2, 15);
      var message = 'Sign in to Wolf Game Cave Mapper\n\nWallet: ' + address + '\nNonce: ' + nonce;
      
      // Request signature from wallet
      var signature = await provider.request({
        method: 'personal_sign',
        params: [message, address]
      });
      
      // Send to Supabase Edge Function for verification + session creation
      var res = await fetch(SUPABASE_URL + '/functions/v1/wallet-auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY
        },
        body: JSON.stringify({
          address: address,
          signature: signature,
          message: message,
          nonce: nonce
        })
      });
      
      var data = await res.json();
      
      if (!res.ok || data.error) {
        return { error: { message: data.error || 'Wallet auth failed' } };
      }
      
      if (data.access_token) {
        localStorage.setItem('cm_access_token', data.access_token);
        localStorage.setItem('cm_refresh_token', data.refresh_token);
        accessToken = data.access_token;
        currentUser = data.user;
        return { data: data };
      }
      
      return { error: { message: 'No session returned' } };
    } catch (e) {
      if (e.code === 4001) {
        return { error: { message: 'Signature request rejected' } };
      }
      return { error: { message: e.message || 'Wallet connection failed' } };
    }
  }

  // ==================== STATE ====================
  window.cmState = {
    tiles: {},
    shinies: {},
    hazards: {},
    extracts: {},
    diggables: {},
    diggableEdges: {},
    savedMarkerPairEdges: {},
    markerPairEdges: {},
    walked: {},
    walkedEdges: {},
    brokenDiggables: {},
    openEdges: {},
    blockedEdges: {},
    routePlan: null,
    markerStrokes: [],
    energy: null,
    maxEnergy: ROUTE_START_ENERGY,
    pos: null,
    totalSteps: 0
  };
  var state = window.cmState;

  // ==================== CROWDSOURCE STATE ====================
  var crowdsource = {
    enabled: CROWDSOURCE_ENABLED,
    runSessionId: null,
    gameSessionId: null, // The game's sessionId from API
    gameDay: null,
    spawnPosition: null,
    lastSubmitTime: Date.now(),  // Initialize to now so timer-based auto-submit works from first load
    lastCloudSaveTime: null,
    lastSubmittedState: {
      tilesCount: 0,
      shiniesCount: 0,
      fencesCount: 0,
      extractsCount: 0
    },
    pendingTiles: {},
    pendingShinies: {},
    pendingFences: {},
    pendingExtracts: {},
    pendingWalked: {},
    isSubmitting: false,
    lastEnergy: null,
    runStartDetected: false
  };

  // ==================== LOCAL STORAGE ====================
  var STORAGE_KEY = 'wolfCaveMapperState';
  var CROWDSOURCE_KEY = 'wolfCaveMapperCrowdsource';
  
  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        tiles: state.tiles,
        shinies: state.shinies,
        hazards: state.hazards,
        extracts: state.extracts,
        diggables: state.diggables,
        diggableEdges: state.diggableEdges,
        savedMarkerPairEdges: state.savedMarkerPairEdges,
        walked: state.walked,
        walkedEdges: state.walkedEdges,
        openEdges: state.openEdges,
        blockedEdges: state.blockedEdges,
        markerStrokes: state.markerStrokes,
        totalSteps: state.totalSteps
      }));
    } catch (e) {
      console.log('CM: Could not save state', e);
    }
  }
  
  function loadState() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        var data = JSON.parse(saved);
        state.tiles = data.tiles || {};
        state.shinies = data.shinies || {};
        state.hazards = data.hazards || {};
        state.extracts = data.extracts || {};
        state.diggables = data.diggables || {};
        state.diggableEdges = data.diggableEdges || {};
        state.savedMarkerPairEdges = data.savedMarkerPairEdges || data.markerPairEdges || {};
        state.markerPairEdges = Object.assign({}, state.savedMarkerPairEdges);
        state.walked = data.walked || {};
        state.walkedEdges = data.walkedEdges || {};
        state.brokenDiggables = data.brokenDiggables || {};
        state.openEdges = data.openEdges || {};
        state.blockedEdges = data.blockedEdges || {};
        state.markerStrokes = Array.isArray(data.markerStrokes) ? data.markerStrokes : [];
        state.totalSteps = data.totalSteps || 0;
        resetDerivedWallState();
        sanitizeMapState();
        saveState();
        console.log('CM: Loaded saved map data');
        return true;
      }
    } catch (e) {
      console.log('CM: Could not load state', e);
    }
    return false;
  }
  
  function saveCrowdsourceState() {
    try {
      localStorage.setItem(CROWDSOURCE_KEY, JSON.stringify({
        runSessionId: crowdsource.runSessionId,
        gameSessionId: crowdsource.gameSessionId,
        gameDay: crowdsource.gameDay,
        spawnPosition: crowdsource.spawnPosition,
        lastSubmittedState: crowdsource.lastSubmittedState
      }));
    } catch (e) {
      console.log('CM: Could not save crowdsource state', e);
    }
  }
  
  function loadCrowdsourceState() {
    try {
      var saved = localStorage.getItem(CROWDSOURCE_KEY);
      if (saved) {
        var data = JSON.parse(saved);
        crowdsource.runSessionId = data.runSessionId;
        crowdsource.gameSessionId = data.gameSessionId;
        crowdsource.gameDay = data.gameDay;
        crowdsource.spawnPosition = data.spawnPosition;
        crowdsource.lastSubmittedState = data.lastSubmittedState || crowdsource.lastSubmittedState;
        console.log('CM: Loaded crowdsource state, game day:', crowdsource.gameDay, 'session:', crowdsource.gameSessionId);
        return true;
      }
    } catch (e) {
      console.log('CM: Could not load crowdsource state', e);
    }
    return false;
  }
  
  loadState();
  loadCrowdsourceState();

  // ==================== RUN SESSION DETECTION ====================
  
  function getUTCGameDay(date) {
    date = date || new Date();
    return date.toISOString().split('T')[0];
  }
  
  function isSpawnPosition(x, y) {
    var pos = x + ',' + y;
    return KNOWN_SPAWN_POSITIONS.includes(pos);
  }
  
  function detectNewRun(gameData) {
    // Returns array of signals if this appears to be a NEW run, null if continuing
    var signals = [];
    
    // Get the data object (might be nested under .data)
    var g = gameData.data || gameData;
    
    // PRIMARY SIGNAL: SessionId changed (most reliable!)
    if (g.sessionId) {
      if (crowdsource.gameSessionId && crowdsource.gameSessionId !== g.sessionId) {
        signals.push('session_changed');
        console.log('CM: New run signal - sessionId changed from', crowdsource.gameSessionId, 'to', g.sessionId);
      }
      // If we don't have a stored sessionId yet, this is first load - not a "new" run
      if (!crowdsource.gameSessionId) {
        crowdsource.gameSessionId = g.sessionId;
        saveCrowdsourceState();
        console.log('CM: First session detected:', g.sessionId);
      }
    }
    
    // SECONDARY SIGNAL: Energy reset to full (200) from low
    if (g.energy !== undefined && g.maxEnergy !== undefined) {
      var currentEnergy = g.energy;
      var maxEnergy = g.maxEnergy;
      if (crowdsource.lastEnergy !== null && crowdsource.lastEnergy < 50 && currentEnergy === maxEnergy) {
        signals.push('energy_reset');
        console.log('CM: New run signal - energy reset from', crowdsource.lastEnergy, 'to', currentEnergy);
      }
      crowdsource.lastEnergy = currentEnergy;
    }
    
    // TERTIARY SIGNAL: Position at spawn (50,50) AND energy is full AND we had existing data
    if (g.position !== undefined && g.energy !== undefined) {
      var newX = g.position % 100;
      var newY = Math.floor(g.position / 100);
      var newPosKey = newX + ',' + newY;
      
      if (isSpawnPosition(newX, newY) && g.energy === (g.maxEnergy || 200)) {
        // At spawn with full energy
        var existingTilesCount = Object.keys(state.tiles).length;
        if (existingTilesCount > 100) {
          // We had significant exploration, now at spawn with full energy
          signals.push('spawn_with_full_energy');
          console.log('CM: New run signal - at spawn with full energy, had', existingTilesCount, 'tiles');
        }
      }
    }
    
    return signals.length > 0 ? signals : null;
  }
  
  async function handleNewRunDetected(signals, gameData) {
    console.log('CM: New run detected! Signals:', signals.join(', '));
    
    // Get the data object (might be nested under .data)
    var g = gameData.data || gameData;
    
    // Calculate game day for this new run (UTC)
    var newGameDay = getUTCGameDay();
    
    // Determine spawn position
    var newSpawnPos = null;
    if (g.position !== undefined) {
      var x = g.position % 100;
      var y = Math.floor(g.position / 100);
      newSpawnPos = x + ',' + y;
    }
    
    // Get the new session ID
    var newSessionId = g.sessionId || null;
    
    // Check if the day has changed
    var dayChanged = crowdsource.gameDay && crowdsource.gameDay !== newGameDay;
    
    // Check if this is a TRUE new run (spawn position + full energy signals)
    var isActualNewRun = signals.includes('energy_reset') || signals.includes('spawn_with_full_energy');
    
    // If only session_changed (no actual new run signals), just update session and continue
    if (!isActualNewRun) {
      console.log('CM: Session changed but no new run signals, keeping current map');
      if (newSessionId) {
        crowdsource.gameSessionId = newSessionId;
      }
      saveCrowdsourceState();
      return false;
    }
    
    // Actual new run detected - check if day changed
    if (!dayChanged) {
      // Same day new run - just update session ID and continue with current map
      console.log('CM: New run on same day (' + newGameDay + '), keeping current map');
      if (newSessionId) {
        crowdsource.gameSessionId = newSessionId;
      }
      crowdsource.spawnPosition = newSpawnPos;
      saveCrowdsourceState();
      
      // Create new run session in backend (for tracking purposes)
      if (currentUser && crowdsource.enabled) {
        await createRunSession(newSpawnPos, newGameDay);
      }
      
      return false; // Don't clear map
    }
    
    // Day has changed AND new run started - automatically reset the map
    console.log('CM: New day + new run detected! Auto-resetting map from', crowdsource.gameDay, 'to', newGameDay);
    
    // Auto-reset: Clear local state
    state.tiles = {};
    state.shinies = {};
    state.hazards = {};
    state.extracts = {};
    state.diggables = {};
    state.diggableEdges = {};
    state.savedMarkerPairEdges = {};
    state.markerPairEdges = {};
    state.walked = {};
    state.brokenDiggables = {};
    state.openEdges = {};
    state.blockedEdges = {};
    state.markerStrokes = [];
    state.totalSteps = 0;
    
    // Reset crowdsource tracking
    crowdsource.runSessionId = null;
    crowdsource.gameSessionId = newSessionId;
    crowdsource.gameDay = newGameDay;
    crowdsource.spawnPosition = newSpawnPos;
    crowdsource.lastSubmittedState = { tilesCount: 0, shiniesCount: 0, fencesCount: 0, extractsCount: 0 };
    crowdsource.pendingTiles = {};
    crowdsource.pendingShinies = {};
    crowdsource.pendingFences = {};
    crowdsource.pendingExtracts = {};
    crowdsource.pendingWalked = {};
    crowdsource.runStartDetected = true;
    
    saveState();
    saveCrowdsourceState();
    
    // Create new run session in backend
    if (currentUser && crowdsource.enabled) {
      await createRunSession(newSpawnPos, newGameDay);
    }
    
    updateCrowdsourceIndicator();
    console.log('CM: New run started for game day:', newGameDay, 'sessionId:', newSessionId);
    
    // Notify user (non-blocking)
    alert('New day! Map reset for ' + newGameDay);
    
    return true;
  }
  
  async function createRunSession(spawnPos, gameDay) {
    if (!currentUser) return null;
    
    try {
      console.log('CM: Creating run session — spawn:', spawnPos, 'gameDay:', gameDay, 'user:', currentUser.id);
      var result = await supabase.rpc('get_or_create_run_session', {
        p_spawn_position: spawnPos,
        p_game_day: gameDay
      });
      
      if (result.error) {
        console.error('CM: Run session RPC failed:', JSON.stringify(result.error));
        return null;
      }
      
      crowdsource.runSessionId = result.data;
      saveCrowdsourceState();
      console.log('CM: Run session created/retrieved:', crowdsource.runSessionId);
      return crowdsource.runSessionId;
    } catch (e) {
      console.error('CM: Run session exception:', e);
      return null;
    }
  }

  // ==================== AUTO-SUBMIT ====================
  
  function trackPendingData(key, type, data) {
    switch (type) {
      case 'tile':
        crowdsource.pendingTiles[key] = data;
        break;
      case 'shiny':
        crowdsource.pendingShinies[key] = data;
        break;
      case 'fence':
        crowdsource.pendingFences[key] = data;
        break;
      case 'extract':
        crowdsource.pendingExtracts[key] = data;
        break;
      case 'walked':
        crowdsource.pendingWalked[key] = true;
        break;
    }
  }
  
  function getPendingCounts() {
    return {
      tiles: Object.keys(crowdsource.pendingTiles).length,
      shinies: Object.keys(crowdsource.pendingShinies).length,
      fences: Object.keys(crowdsource.pendingFences).length,
      extracts: Object.keys(crowdsource.pendingExtracts).length,
      walked: Object.keys(crowdsource.pendingWalked).length
    };
  }
  
  function shouldAutoSubmit() {
    if (!crowdsource.enabled || !currentUser || crowdsource.isSubmitting) return false;
    
    var pending = getPendingCounts();
    var totalPending = pending.tiles + pending.shinies + pending.fences + pending.extracts;
    
    // Submit if enough new data
    if (totalPending >= AUTO_SUBMIT_TILE_THRESHOLD) return true;
    
    // Submit if enough time has passed and there's any pending data
    if (crowdsource.lastSubmitTime) {
      var timeSinceLastSubmit = Date.now() - crowdsource.lastSubmitTime;
      if (timeSinceLastSubmit >= AUTO_SUBMIT_INTERVAL_MS && totalPending > 0) return true;
    }
    
    return false;
  }
  
  async function submitContribution() {
    if (!currentUser || !crowdsource.enabled || crowdsource.isSubmitting) return;
    
    var pending = getPendingCounts();
    if (pending.tiles === 0 && pending.shinies === 0 && pending.fences === 0 && pending.extracts === 0) {
      return; // Nothing to submit
    }
    
    crowdsource.isSubmitting = true;
    updateCrowdsourceIndicator();
    
    try {
      // Ensure we have a run session
      if (!crowdsource.runSessionId) {
        await createRunSession(crowdsource.spawnPosition, crowdsource.gameDay || getUTCGameDay());
      }
      
      if (!crowdsource.runSessionId) {
        console.log('CM: Cannot submit - no run session');
        crowdsource.isSubmitting = false;
        return;
      }
      
      // Prepare contribution data - filter to only floor tiles
      var tilesToSubmit = {};
      for (var key in crowdsource.pendingTiles) {
        var tile = crowdsource.pendingTiles[key];
        if (tile.type !== 'wall') {
          tilesToSubmit[key] = tile;
        }
      }
      
      var shiniesToSubmit = Object.keys(crowdsource.pendingShinies).map(function(k) {
        return crowdsource.pendingShinies[k];
      });
      
      var fencesToSubmit = Object.keys(crowdsource.pendingFences).map(function(k) {
        return crowdsource.pendingFences[k];
      });
      
      var extractsToSubmit = Object.keys(crowdsource.pendingExtracts).map(function(k) {
        return crowdsource.pendingExtracts[k];
      });
      
      var contribution = {
        run_session_id: crowdsource.runSessionId,
        contributor_id: currentUser.id,
        game_day: crowdsource.gameDay || getUTCGameDay(),
        tiles: tilesToSubmit,
        shinies: shiniesToSubmit,
        fences: fencesToSubmit,
        extracts: extractsToSubmit,
        walked: crowdsource.pendingWalked,
        new_tiles_count: Object.keys(tilesToSubmit).length,
        new_shinies_count: shiniesToSubmit.length,
        new_fences_count: fencesToSubmit.length,
        new_extracts_count: extractsToSubmit.length
      };
      
      var result = await supabase.from('map_contributions').insert(contribution);
      
      if (result.error) {
        console.log('CM: Contribution failed:', result.error);
      } else {
        console.log('CM: Contribution submitted!', pending);
        
        // Clear pending data
        crowdsource.pendingTiles = {};
        crowdsource.pendingShinies = {};
        crowdsource.pendingFences = {};
        crowdsource.pendingExtracts = {};
        crowdsource.pendingWalked = {};
        crowdsource.lastSubmitTime = Date.now();
        
        // Update last submitted counts
        crowdsource.lastSubmittedState = {
          tilesCount: Object.keys(state.tiles).length,
          shiniesCount: Object.keys(state.shinies).length,
          fencesCount: Object.keys(state.hazards).length,
          extractsCount: Object.keys(state.extracts).length
        };
        
        saveCrowdsourceState();
        
        // Auto Cloud Save full state (throttled to every 2 minutes)
        var now = Date.now();
        if (!crowdsource.lastCloudSaveTime || (now - crowdsource.lastCloudSaveTime) > 120000) {
          autoCloudSave();
        }
      }
    } catch (e) {
      console.log('CM: Contribution error:', e);
    }
    
    crowdsource.isSubmitting = false;
    updateCrowdsourceIndicator();
  }
  
  // Auto-submit timer (crowdsource contributions)
  setInterval(function() {
    if (shouldAutoSubmit()) {
      submitContribution();
    }
  }, 30000); // Check every 30 seconds

  // ==================== FULL STATE CONTRIBUTION ====================
  // Pushes the entire current map state as a contribution (not just pending data).
  // Called after every successful cloud save to ensure aggregated maps stay in sync.
  async function submitFullContribution() {
    if (!currentUser || !crowdsource.enabled) return;
    
    var tileCount = Object.keys(state.tiles).length;
    if (tileCount === 0) return;
    
    try {
      // Ensure we have a run session
      if (!crowdsource.runSessionId) {
        var gameDay = crowdsource.gameDay || getUTCGameDay();
        var spawnPos = crowdsource.spawnPosition || (state.pos ? state.pos.x + ',' + state.pos.y : '50,50');
        await createRunSession(spawnPos, gameDay);
      }
      
      if (!crowdsource.runSessionId) {
        console.error('CM: Full contribution failed — no run session. Check if get_or_create_run_session RPC exists.');
        return;
      }
      
      // Build full tile set (floor tiles only)
      var allTiles = {};
      for (var key in state.tiles) {
        if (state.tiles[key].type !== 'wall') {
          allTiles[key] = state.tiles[key];
        }
      }
      
      var allShinies = Object.keys(state.shinies).map(function(k) { return state.shinies[k]; });
      var allHazards = Object.keys(state.hazards).map(function(k) { return state.hazards[k]; });
      var allExtracts = Object.keys(state.extracts).map(function(k) { return state.extracts[k]; });
      
      var contribution = {
        run_session_id: crowdsource.runSessionId,
        contributor_id: currentUser.id,
        game_day: crowdsource.gameDay || getUTCGameDay(),
        tiles: allTiles,
        shinies: allShinies,
        fences: allHazards,
        extracts: allExtracts,
        walked: state.walked,
        new_tiles_count: Object.keys(allTiles).length,
        new_shinies_count: allShinies.length,
        new_fences_count: allHazards.length,
        new_extracts_count: allExtracts.length
      };
      
      var result = await supabase.from('map_contributions').insert(contribution);
      
      if (result.error) {
        var errMsg = (result.error.message || result.error.msg || JSON.stringify(result.error));
        console.error('CM: Full contribution FAILED:', errMsg);
      } else {
        console.log('CM: Full contribution SUCCESS —', Object.keys(allTiles).length, 'tiles,', allShinies.length, 'shinies,', allHazards.length, 'hazards,', allExtracts.length, 'extracts');
        
        // Clear pending since full state is now contributed
        crowdsource.pendingTiles = {};
        crowdsource.pendingShinies = {};
        crowdsource.pendingFences = {};
        crowdsource.pendingExtracts = {};
        crowdsource.pendingWalked = {};
        crowdsource.lastSubmitTime = Date.now();
        saveCrowdsourceState();
      }
    } catch (e) {
      console.error('CM: Full contribution exception:', e);
    }
  }

  // Independent auto cloud save timer
  // Fires every 3 minutes if logged in and there's map data, regardless of contribution state
  setInterval(function() {
    if (!currentUser) return;
    var tileCount = Object.keys(state.tiles).length;
    if (tileCount === 0) return;
    
    var now = Date.now();
    // Only save if at least 3 minutes since last cloud save (manual or auto)
    if (crowdsource.lastCloudSaveTime && (now - crowdsource.lastCloudSaveTime) < 180000) return;
    
    // Only save if something changed since last save
    var currentState = tileCount + '|' + Object.keys(state.shinies).length + '|' + Object.keys(state.hazards).length + '|' + state.totalSteps;
    if (crowdsource._lastSavedStateKey === currentState) return;
    
    crowdsource._lastSavedStateKey = currentState;
    autoCloudSave();
    console.log('CM: Independent auto cloud save triggered (' + tileCount + ' tiles)');
  }, 60000); // Check every 60 seconds

  // ==================== CLOUD SAVE/LOAD (Personal) ====================
  async function cloudSave(saveName) {
    if (!currentUser) {
      showAuthModal();
      return;
    }
    
    // Try to refresh session first in case JWT expired
    try {
      var sessionResult = await supabase.auth.getSession();
      if (!sessionResult.data?.session) {
        var refreshResult = await supabase.auth.refreshSession();
        if (refreshResult.error || !refreshResult.data?.session) {
          currentUser = null;
          alert('Session expired. Please log in again.');
          showAuthModal();
          return;
        }
        currentUser = refreshResult.data.session.user;
      }
    } catch (e) {
      console.log('CM: Session check failed:', e);
    }
    
    var now = new Date();
    var utcHour = now.getUTCHours();
    var utcDay = now.getUTCDay();
    
    if (utcDay === 0 && utcHour >= 16) {
      alert('Weekly save window has closed (after 4pm UTC Sunday). New week starts soon!');
      return;
    }
    
    var gameDay = crowdsource.gameDay || now.toISOString().split('T')[0];
    
    var saveData = {
      user_id: currentUser.id,
      tiles: state.tiles,
      shinies: state.shinies,
      hazards: state.hazards,
      extracts: state.extracts,
      diggables: state.diggables,
      diggableEdges: state.diggableEdges,
      savedMarkerPairEdges: state.savedMarkerPairEdges,
      walked: state.walked,
      walkedEdges: state.walkedEdges,
      total_steps: state.totalSteps,
      tiles_count: Object.keys(state.tiles).length,
      shinies_count: Object.keys(state.shinies).length,
      hazards_count: Object.keys(state.hazards).length,
      extracts_count: Object.keys(state.extracts).length,
      game_day: gameDay,
      save_name: saveName || 'Save ' + now.toLocaleString()
    };
    
    try {
      console.log('CM: Cloud save attempt — user:', currentUser.id, 'gameDay:', gameDay, 'tiles:', Object.keys(state.tiles).length, 'token:', accessToken ? (accessToken.substring(0, 20) + '...') : 'NULL');
      var result = await supabase.from('map_saves').insert(saveData);
      console.log('CM: Cloud save result:', JSON.stringify(result).substring(0, 300));
      if (result.error) {
        // Check if it's an auth error
        var errMsg = (result.error.message || result.error.msg || JSON.stringify(result.error));
        if (errMsg.includes('JWT') || errMsg.includes('expired') || errMsg.includes('401') || result.error.code === 'PGRST301') {
          currentUser = null;
          alert('Session expired. Please log in again.');
          showAuthModal();
          return;
        }
        alert('Save failed: ' + errMsg);
      } else {
        alert('Map saved to cloud! ☁️\nGame day: ' + gameDay + '\nTiles: ' + Object.keys(state.tiles).length);
        // Also push full state as contribution for aggregation
        submitFullContribution();
      }
    } catch (e) {
      console.error('CM: Cloud save exception:', e);
      alert('Save failed: ' + e.message);
    }
  }
  
  // Silent auto Cloud Save (no alerts, runs in background)
  async function autoCloudSave() {
    if (!currentUser) return;
    
    // Check session
    try {
      var sessionResult = await supabase.auth.getSession();
      if (!sessionResult.data?.session) {
        var refreshResult = await supabase.auth.refreshSession();
        if (refreshResult.error || !refreshResult.data?.session) {
          console.log('CM: Auto cloud save skipped - session expired');
          return;
        }
        currentUser = refreshResult.data.session.user;
      }
    } catch (e) {
      console.log('CM: Auto cloud save session check failed:', e);
      return;
    }
    
    var now = new Date();
    var gameDay = crowdsource.gameDay || now.toISOString().split('T')[0];
    
    var saveData = {
      user_id: currentUser.id,
      tiles: state.tiles,
      shinies: state.shinies,
      hazards: state.hazards,
      extracts: state.extracts,
      diggables: state.diggables,
      diggableEdges: state.diggableEdges,
      savedMarkerPairEdges: state.savedMarkerPairEdges,
      walked: state.walked,
      walkedEdges: state.walkedEdges,
      total_steps: state.totalSteps,
      tiles_count: Object.keys(state.tiles).length,
      shinies_count: Object.keys(state.shinies).length,
      hazards_count: Object.keys(state.hazards).length,
      extracts_count: Object.keys(state.extracts).length,
      game_day: gameDay,
      save_name: 'Auto-save ' + now.toLocaleTimeString()
    };
    
    try {
      console.log('CM: Auto cloud save attempt — user:', currentUser.id, 'gameDay:', gameDay, 'tiles:', Object.keys(state.tiles).length);
      var result = await supabase.from('map_saves').insert(saveData);
      if (result.error) {
        var errMsg = (result.error.message || result.error.msg || JSON.stringify(result.error));
        console.error('CM: Auto cloud save FAILED:', errMsg);
      } else {
        crowdsource.lastCloudSaveTime = Date.now();
        console.log('CM: Auto cloud save SUCCESS -', Object.keys(state.tiles).length, 'tiles, gameDay:', gameDay);
        // Also push full contribution (throttled separately to every 5 min)
        var now2 = Date.now();
        if (!crowdsource._lastFullContribTime || (now2 - crowdsource._lastFullContribTime) > 300000) {
          crowdsource._lastFullContribTime = now2;
          submitFullContribution();
        }
      }
    } catch (e) {
      console.error('CM: Auto cloud save exception:', e);
    }
  }
  
  async function loadCloudSaves() {
    if (!currentUser) {
      showAuthModal();
      return;
    }
    
    try {
      // Try to refresh session first in case JWT expired
      var sessionResult = await supabase.auth.getSession();
      if (!sessionResult.data?.session) {
        // Session expired, try to refresh
        var refreshResult = await supabase.auth.refreshSession();
        if (refreshResult.error || !refreshResult.data?.session) {
          // Refresh failed, need to re-authenticate
          currentUser = null;
          alert('Session expired. Please log in again.');
          showAuthModal();
          return;
        }
        currentUser = refreshResult.data.session.user;
      }
      
      var result = await supabase
        .from('map_saves')
        .select('id,save_name,tiles_count,shinies_count,hazards_count,extracts_count,total_steps,game_day,created_at')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (result.error) {
        // Check if it's an auth error
        if (result.error.message.includes('JWT') || result.error.code === 'PGRST301') {
          currentUser = null;
          alert('Session expired. Please log in again.');
          showAuthModal();
          return;
        }
        alert('Could not load saves: ' + result.error.message);
        return;
      }
      
      showSavesModal(result.data);
    } catch (e) {
      alert('Could not load saves: ' + e.message);
    }
  }
  
  async function loadCloudMap(saveId) {
    try {
      var result = await supabase
        .from('map_saves')
        .select('*')
        .eq('id', saveId)
        .limit(1);
      
      if (result.error || !result.data || !result.data[0]) {
        alert('Could not load map');
        return;
      }
      
      var save = result.data[0];
      var choice = confirm('Load map from ' + save.save_name + '?\n\nOK = Replace current map\nCancel = Merge with current map');
      
      if (choice) {
        state.tiles = save.tiles || {};
        state.shinies = save.shinies || {};
        state.hazards = save.hazards || {};
        state.extracts = save.extracts || {};
        state.diggables = save.diggables || {};
        state.diggableEdges = save.diggableEdges || {};
        state.savedMarkerPairEdges = save.savedMarkerPairEdges || save.markerPairEdges || {};
        state.markerPairEdges = Object.assign({}, state.savedMarkerPairEdges);
        state.walked = save.walked || {};
        state.walkedEdges = save.walkedEdges || {};
        state.brokenDiggables = save.brokenDiggables || {};
        state.markerStrokes = Array.isArray(save.markerStrokes) ? save.markerStrokes : [];
        state.totalSteps = save.total_steps || 0;
      } else {
        Object.assign(state.tiles, save.tiles || {});
        Object.assign(state.shinies, save.shinies || {});
        Object.assign(state.hazards, save.hazards || {});
        Object.assign(state.extracts, save.extracts || {});
        Object.assign(state.diggables, save.diggables || {});
        Object.assign(state.diggableEdges, save.diggableEdges || {});
        Object.assign(state.savedMarkerPairEdges, save.savedMarkerPairEdges || save.markerPairEdges || {});
        state.markerPairEdges = Object.assign({}, state.savedMarkerPairEdges);
        Object.assign(state.walked, save.walked || {});
        Object.assign(state.walkedEdges, save.walkedEdges || {});
        Object.assign(state.brokenDiggables, save.brokenDiggables || {});
        if (Array.isArray(save.markerStrokes)) {
          state.markerStrokes = (state.markerStrokes || []).concat(save.markerStrokes);
        }
        state.totalSteps = Math.max(state.totalSteps, save.total_steps || 0);
      }
      
      saveState();
      center();
      update();
      closeSavesModal();
      alert('Map loaded! 🗺️');
    } catch (e) {
      alert('Load failed: ' + e.message);
    }
  }

  // ==================== AUTH MODAL ====================
  function showAuthModal() {
    if (document.getElementById('cm-auth-modal')) return;
    
    var modal = document.createElement('div');
    modal.id = 'cm-auth-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);z-index:9999999;display:flex;align-items:center;justify-content:center;';
    modal.innerHTML = `
      <div style="background:#1a1a2e;padding:25px;border-radius:12px;width:320px;color:#eee;font-family:sans-serif;">
        <h2 style="margin:0 0 20px 0;text-align:center;">🐺 Cave Mapper Login</h2>
        
        <div id="cm-auth-tabs" style="display:flex;margin-bottom:15px;">
          <button id="cm-tab-login" style="flex:1;padding:8px;background:#2a9d8f;border:none;color:#fff;cursor:pointer;border-radius:4px 0 0 4px;">Login</button>
          <button id="cm-tab-signup" style="flex:1;padding:8px;background:#333;border:none;color:#fff;cursor:pointer;border-radius:0 4px 4px 0;">Sign Up</button>
        </div>
        
        <div id="cm-auth-form">
          <input type="email" id="cm-auth-email" placeholder="Email" style="width:100%;padding:10px;margin-bottom:10px;border:1px solid #444;border-radius:4px;background:#2a2a3e;color:#fff;box-sizing:border-box;">
          <input type="password" id="cm-auth-password" placeholder="Password" style="width:100%;padding:10px;margin-bottom:15px;border:1px solid #444;border-radius:4px;background:#2a2a3e;color:#fff;box-sizing:border-box;">
          <button id="cm-auth-submit" style="width:100%;padding:12px;background:#2a9d8f;border:none;color:#fff;border-radius:4px;cursor:pointer;font-size:14px;">Login</button>
        </div>
        
        <div style="text-align:center;margin:15px 0;color:#666;">— or —</div>
        
        <button id="cm-auth-google" style="width:100%;padding:12px;background:#4285f4;border:none;color:#fff;border-radius:4px;cursor:pointer;margin-bottom:10px;font-size:14px;">
          Continue with Google
        </button>
        
        <button id="cm-auth-wallet" style="width:100%;padding:12px;background:#7c3aed;border:none;color:#fff;border-radius:4px;cursor:pointer;font-size:14px;">
          Connect Abstract Wallet
        </button>
        
        <button id="cm-auth-close" style="width:100%;padding:10px;background:transparent;border:1px solid #444;color:#888;border-radius:4px;cursor:pointer;margin-top:15px;">Cancel</button>
      </div>
    `;
    document.body.appendChild(modal);
    
    var isLogin = true;
    
    document.getElementById('cm-tab-login').onclick = function() {
      isLogin = true;
      this.style.background = '#2a9d8f';
      document.getElementById('cm-tab-signup').style.background = '#333';
      document.getElementById('cm-auth-submit').textContent = 'Login';
    };
    
    document.getElementById('cm-tab-signup').onclick = function() {
      isLogin = false;
      this.style.background = '#2a9d8f';
      document.getElementById('cm-tab-login').style.background = '#333';
      document.getElementById('cm-auth-submit').textContent = 'Sign Up';
    };
    
    document.getElementById('cm-auth-submit').onclick = async function() {
      var email = document.getElementById('cm-auth-email').value;
      var password = document.getElementById('cm-auth-password').value;
      
      if (!email || !password) {
        alert('Please enter email and password');
        return;
      }
      
      this.textContent = 'Loading...';
      this.disabled = true;
      
      var result;
      if (isLogin) {
        result = await supabase.auth.signInWithPassword(email, password);
      } else {
        result = await supabase.auth.signUp(email, password);
      }
      
      if (result.error) {
        alert('Error: ' + (result.error.message || result.error.error_description || 'Unknown error'));
        this.textContent = isLogin ? 'Login' : 'Sign Up';
        this.disabled = false;
      } else {
        closeAuthModal();
        updateAuthUI();
        updateCrowdsourceIndicator();
        if (!isLogin) {
          alert('Account created! Check your email to confirm.');
        }
      }
    };
    
    document.getElementById('cm-auth-google').onclick = async function() {
      this.textContent = 'Connecting...';
      this.disabled = true;
      
      var result = await supabase.auth.signInWithOAuth('google');
      
      if (result.error) {
        alert('Google sign-in failed: ' + (result.error.message || 'Unknown error'));
        this.textContent = 'Continue with Google';
        this.disabled = false;
      } else {
        closeAuthModal();
        updateAuthUI();
        updateCrowdsourceIndicator();
      }
    };
    
    document.getElementById('cm-auth-wallet').onclick = async function() {
      this.textContent = 'Connecting wallet...';
      this.disabled = true;
      
      var result = await walletAuth();
      
      if (result.error) {
        alert('Wallet sign-in failed: ' + (result.error.message || 'Unknown error'));
        this.textContent = 'Connect Abstract Wallet';
        this.disabled = false;
      } else {
        closeAuthModal();
        updateAuthUI();
        updateCrowdsourceIndicator();
      }
    };
    
    document.getElementById('cm-auth-close').onclick = closeAuthModal;
  }
  
  function closeAuthModal() {
    var modal = document.getElementById('cm-auth-modal');
    if (modal) modal.remove();
  }

  // ==================== SAVES LIST MODAL ====================
  function showSavesModal(saves) {
    if (document.getElementById('cm-saves-modal')) return;
    
    var savesHtml = saves.length ? saves.map(function(s) {
      return '<div style="padding:10px;border-bottom:1px solid #333;cursor:pointer;" class="cm-save-item" data-id="' + s.id + '">' +
        '<div style="font-weight:bold;">' + (s.save_name || 'Unnamed') + '</div>' +
        '<div style="font-size:11px;color:#888;">' + s.game_day + ' • 💎' + s.shinies_count + ' ⚡' + s.hazards_count + ' 🪜' + s.extracts_count + '</div>' +
      '</div>';
    }).join('') : '<div style="padding:20px;text-align:center;color:#666;">No saves yet</div>';
    
    var modal = document.createElement('div');
    modal.id = 'cm-saves-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);z-index:9999999;display:flex;align-items:center;justify-content:center;';
    modal.innerHTML = `
      <div style="background:#1a1a2e;padding:20px;border-radius:12px;width:350px;max-height:80vh;color:#eee;font-family:sans-serif;">
        <h2 style="margin:0 0 15px 0;">☁️ Your Cloud Saves</h2>
        <div style="max-height:400px;overflow-y:auto;border:1px solid #333;border-radius:4px;">
          ${savesHtml}
        </div>
        <button id="cm-saves-close" style="width:100%;padding:10px;background:#333;border:none;color:#fff;border-radius:4px;cursor:pointer;margin-top:15px;">Close</button>
      </div>
    `;
    document.body.appendChild(modal);
    
    modal.querySelectorAll('.cm-save-item').forEach(function(item) {
      item.onmouseover = function() { this.style.background = '#2a2a3e'; };
      item.onmouseout = function() { this.style.background = 'transparent'; };
      item.onclick = function() {
        loadCloudMap(this.dataset.id);
      };
    });
    
    document.getElementById('cm-saves-close').onclick = closeSavesModal;
  }
  
  function closeSavesModal() {
    var modal = document.getElementById('cm-saves-modal');
    if (modal) modal.remove();
  }

  // ==================== UI ====================
  var panel = document.createElement('div');
  panel.id = 'cave-mapper';
  panel.style.cssText = 'position:fixed;top:10px;right:10px;width:380px;height:450px;min-width:300px;min-height:380px;background:#111;border:2px solid #444;border-radius:10px;font-family:sans-serif;font-size:12px;color:#eee;z-index:999999;display:flex;flex-direction:column;resize:both;overflow:hidden;';
  
  var btnStyle = 'padding:5px 10px;background:#3a3a4a;border:1px solid #555;color:#fff;border-radius:4px;cursor:pointer;font-size:11px;transition:background 0.2s;';
  var btnHover = 'onmouseover="this.style.background=\'#4a5a6a\'" onmouseout="this.style.background=\'#3a3a4a\'"';
  var btnPrimaryStyle = 'padding:5px 10px;background:#2a9d8f;border:1px solid #3ab5a5;color:#fff;border-radius:4px;cursor:pointer;font-size:11px;transition:background 0.2s;';
  var btnPrimaryHover = 'onmouseover="this.style.background=\'#3ab5a5\'" onmouseout="this.style.background=\'#2a9d8f\'"';
  
  panel.innerHTML = `
    <div id="cm-header" style="background:#2a9d8f;padding:10px 15px;border-radius:8px 8px 0 0;cursor:move;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
      <span style="font-weight:bold;">🐺 Cave Mapper v3.0</span>
      <div style="display:flex;gap:5px;">
        <button id="cm-center" style="${btnStyle}" ${btnHover}>Center</button>
        <button id="cm-fit" style="${btnStyle}" ${btnHover}>Fit</button>
        <button id="cm-clear" style="${btnStyle}" ${btnHover}>Clear</button>
        <button id="cm-route" style="${btnPrimaryStyle}" ${btnPrimaryHover}>Route</button>
        <button id="cm-import" style="${btnStyle}" ${btnHover}>Import</button>
        <button id="cm-export" style="${btnPrimaryStyle}" ${btnPrimaryHover}>Export</button>
        <button id="cm-close" style="padding:5px 8px;background:#aa3333;border:1px solid #cc4444;color:#fff;border-radius:4px;cursor:pointer;font-size:11px;">✕</button>
      </div>
    </div>
    <div style="padding:10px;background:#1a1a1a;display:flex;gap:10px;font-size:11px;flex-wrap:wrap;align-items:center;flex-shrink:0;">
      <span>📍 <b id="cm-pos">-</b></span>
      <span>🗺️ <b id="cm-tiles">0</b></span>
      <span>👣 <b id="cm-steps">0</b></span>
      <span>💎 <b id="cm-shinies">0</b></span>
      <span>⚡ <b id="cm-hazards">0</b></span>
      <span>🪜 <b id="cm-extracts">0</b></span>
      <button id="cm-add-extract" title="Mark current location as Extract point" style="background:#8B4513;color:#fff;border:1px solid #a05a23;border-radius:4px;padding:2px 6px;cursor:pointer;font-size:10px;">+🪜</button>
    </div>
    <div style="padding:6px 10px;background:#181818;border-top:1px solid #333;display:flex;gap:6px;align-items:center;flex-shrink:0;">
      <button id="cm-tool-pan" style="${btnStyle}" ${btnHover}>Pan</button>
      <button id="cm-tool-marker" style="${btnStyle}" ${btnHover}>Marker</button>
      <button id="cm-tool-eraser" style="${btnStyle}" ${btnHover}>Erase</button>
      <button id="cm-clear-ink" style="${btnStyle}" ${btnHover}>Clear Ink</button>
    </div>
    <div style="padding:6px 10px;background:#1a1a1a;border-top:1px solid #333;font-size:11px;flex-shrink:0;">
      <span>📊 Map Visible: <b id="cm-percent">0.00%</b></span>
    </div>
    <div id="cm-crowdsource-bar" style="padding:6px 10px;background:#1a2a1a;border-top:1px solid #333;font-size:11px;flex-shrink:0;display:flex;justify-content:space-between;align-items:center;">
      <span id="cm-crowdsource-status">🌐 Logging for: <b id="cm-game-day">--</b></span>
      <span id="cm-crowdsource-indicator" style="font-size:10px;color:#888;">⏸️ Not logged in</span>
    </div>
    <div style="padding:8px 10px;background:#252525;display:flex;gap:8px;border-top:1px solid #333;flex-shrink:0;">
      <button id="cm-cloud-save" style="flex:1;padding:6px;background:#2a9d8f;border:1px solid #3ab5a5;color:#fff;border-radius:4px;cursor:pointer;font-size:11px;">☁️ Cloud Save</button>
      <button id="cm-cloud-load" style="flex:1;padding:6px;background:#4a5568;border:1px solid #5a6578;color:#fff;border-radius:4px;cursor:pointer;font-size:11px;">📂 Cloud Load</button>
      <button id="cm-auth-btn" style="flex:1;padding:6px;background:#333;border:1px solid #444;color:#fff;border-radius:4px;cursor:pointer;font-size:11px;">👤 Login</button>
    </div>
    <canvas id="cm-canvas" style="display:block;cursor:grab;flex:1;min-height:150px;"></canvas>
    <div id="cm-resize-handle" style="position:absolute;bottom:0;right:0;width:15px;height:15px;cursor:nwse-resize;background:linear-gradient(135deg,transparent 50%,#555 50%);border-radius:0 0 8px 0;"></div>
  `;
  document.body.appendChild(panel);
  var routeStatusBar = document.createElement('div');
  routeStatusBar.id = 'cm-route-status';
  routeStatusBar.style.cssText = 'padding:5px 10px;background:#151515;border-top:1px solid #333;font-size:11px;color:#88ff88;flex-shrink:0;min-height:14px;';
  routeStatusBar.textContent = '';
  panel.insertBefore(routeStatusBar, document.getElementById('cm-crowdsource-bar'));

  var canvas = document.getElementById('cm-canvas');
  var ctx = canvas.getContext('2d');
  var view = { offX: 173, offY: 125, scale: 10 };
  var mapTool = 'pan';
  var activeStroke = null;

  function screenToMapPoint(e) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - view.offX) / view.scale,
      y: (e.clientY - rect.top - view.offY) / view.scale
    };
  }

  function setMapTool(tool) {
    mapTool = tool || 'pan';
    canvas.style.cursor = mapTool === 'pan' ? 'grab' : (mapTool === 'eraser' ? 'cell' : 'crosshair');
    ['pan', 'marker', 'eraser'].forEach(function(name) {
      var btn = document.getElementById('cm-tool-' + name);
      if (!btn) return;
      var active = mapTool === name;
      btn.style.background = active ? (name === 'marker' ? '#aa3333' : '#2a9d8f') : '#3a3a4a';
      btn.style.borderColor = active ? (name === 'marker' ? '#dd5555' : '#3ab5a5') : '#555';
    });
  }

  function eraseMarkerAt(point) {
    var radius = 0.9;
    state.markerStrokes = state.markerStrokes || [];
    var before = state.markerStrokes.length;
    state.markerStrokes = (state.markerStrokes || []).filter(function(stroke) {
      if (!stroke || !stroke.points) return false;
      for (var i = 0; i < stroke.points.length; i++) {
        var dx = stroke.points[i].x - point.x;
        var dy = stroke.points[i].y - point.y;
        if (Math.sqrt(dx * dx + dy * dy) <= radius) return false;
      }
      return true;
    });
    return before !== state.markerStrokes.length;
  }
  
  function resizeCanvas() {
    var rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    render();
  }
  
  var resizeObserver = new ResizeObserver(resizeCanvas);
  resizeObserver.observe(canvas);
  
  var resizeHandle = document.getElementById('cm-resize-handle');
  var isResizing = false;
  var startX, startY, startWidth, startHeight;
  
  resizeHandle.onmousedown = function(e) {
    isResizing = true;
    startX = e.clientX;
    startY = e.clientY;
    startWidth = panel.offsetWidth;
    startHeight = panel.offsetHeight;
    e.preventDefault();
    e.stopPropagation();
  };
  
  document.addEventListener('mousemove', function(e) {
    if (isResizing) {
      var newWidth = startWidth + (e.clientX - startX);
      var newHeight = startHeight + (e.clientY - startY);
      panel.style.width = Math.max(300, newWidth) + 'px';
      panel.style.height = Math.max(380, newHeight) + 'px';
    }
  });
  
  document.addEventListener('mouseup', function() {
    isResizing = false;
  });
  
  var GRID_SIZE = 100;
  var TOTAL_TILES = GRID_SIZE * GRID_SIZE;

  // ==================== AUTH UI UPDATE ====================
  function getDisplayName(user) {
    if (!user) return 'User';
    // Wallet users have metadata with wallet_address
    var meta = user.user_metadata || {};
    if (meta.wallet_address) {
      var addr = meta.wallet_address;
      return addr.substring(0, 6) + '...' + addr.substring(addr.length - 4);
    }
    // Google/email users
    if (meta.full_name) return meta.full_name.split(' ')[0];
    if (user.email) return user.email.split('@')[0];
    return 'User';
  }
  
  async function updateAuthUI() {
    var btn = document.getElementById('cm-auth-btn');
    var session = await supabase.auth.getSession();
    
    if (session.data.session) {
      currentUser = session.data.session.user;
      btn.textContent = '👤 ' + getDisplayName(currentUser);
      btn.onclick = function() {
        if (confirm('Logout?')) {
          supabase.auth.signOut();
          currentUser = null;
          btn.textContent = '👤 Login';
          btn.onclick = showAuthModal;
          updateCrowdsourceIndicator();
        }
      };
    } else {
      btn.textContent = '👤 Login';
      btn.onclick = showAuthModal;
    }
  }
  
  function updateCrowdsourceIndicator() {
    var statusEl = document.getElementById('cm-crowdsource-status');
    var indicatorEl = document.getElementById('cm-crowdsource-indicator');
    var gameDayEl = document.getElementById('cm-game-day');
    var bar = document.getElementById('cm-crowdsource-bar');
    
    if (!crowdsource.enabled) {
      bar.style.background = '#2a2a2a';
      gameDayEl.textContent = 'Disabled';
      indicatorEl.textContent = '⏸️ Crowdsource off';
      indicatorEl.style.color = '#666';
      return;
    }
    
    if (!currentUser) {
      bar.style.background = '#2a2a1a';
      gameDayEl.textContent = '--';
      indicatorEl.textContent = '⏸️ Login to contribute';
      indicatorEl.style.color = '#888';
      return;
    }
    
    bar.style.background = '#1a2a1a';
    gameDayEl.textContent = crowdsource.gameDay || getUTCGameDay();
    
    if (crowdsource.isSubmitting) {
      indicatorEl.textContent = '📤 Submitting...';
      indicatorEl.style.color = '#ffaa00';
    } else {
      var pending = getPendingCounts();
      var totalPending = pending.tiles + pending.shinies + pending.fences + pending.extracts;
      if (totalPending > 0) {
        indicatorEl.textContent = '📊 ' + totalPending + ' pending';
        indicatorEl.style.color = '#88ff88';
      } else {
        indicatorEl.textContent = '✓ Saved';
        indicatorEl.style.color = '#88ff88';
      }
    }
  }
  
  updateAuthUI();
  updateCrowdsourceIndicator();

  // ==================== DRAWING ====================
  function getColor(seen) {
    var b = Math.min(180, 60 + seen * 35);
    return 'rgb(' + Math.floor(b * 0.2) + ',' + Math.floor(b * 0.4) + ',' + b + ')';
  }

  var learnedDirBits = { n: 8, e: 4, s: 16, w: 2 };
  var directionBitCandidates = {
    n: [8],
    e: [4],
    s: [16],
    w: [2]
  };
  var OFFSETS = {
    n: { dx: 0, dy: -1, opposite: 's' },
    e: { dx: 1, dy: 0, opposite: 'w' },
    s: { dx: 0, dy: 1, opposite: 'n' },
    w: { dx: -1, dy: 0, opposite: 'e' }
  };

  function tileKey(x, y) {
    return x + ',' + y;
  }

  function tileText(t) {
    if (!t) return '';
    var parts = [];
    ['type', 'kind', 'code', 'name', 'message', 'label', 'sprite', 'asset', 'texture', 'class'].forEach(function(field) {
      if (t[field] !== undefined && t[field] !== null) parts.push(String(t[field]));
    });
    return parts.join(' ').toUpperCase();
  }

  function classifyTile(t) {
    var key = tileKey(t.x, t.y);
    var text = tileText(t);
    if (t.diggable === true || text.indexOf('DIGGABLE') >= 0 || text.indexOf('BREAK') >= 0) return 'diggable_wall';
    if (t.walkable === false || t.passable === false || t.traversable === false || t.blocked === true || t.solid === true) return 'wall';
    if (text.indexOf('WALL') >= 0 || text.indexOf('ROCK') >= 0 || text.indexOf('BOULDER') >= 0) return 'wall';
    if (t.directions === 0) return 'wall';
    if (state.walked && state.walked[key]) return 'floor';
    return 'floor';
  }

  function markBrokenDiggable(x, y) {
    state.brokenDiggables = state.brokenDiggables || {};
    var key = tileKey(x, y);
    state.brokenDiggables[key] = true;
    removeDiggableEdgesTouchingTile(x, y);
    var tile = state.tiles[key];
    if (tile && tile.type === 'diggable_wall') {
      tile.diggable = true;
    }
  }

  function removeDiggableEdgesTouchingTile(x, y) {
    if (!state || !state.diggableEdges) return 0;
    var removed = 0;
    var key = tileKey(x, y);
    for (var edgeId in state.diggableEdges) {
      var edge = state.diggableEdges[edgeId];
      if (!edge) continue;
      var off = OFFSETS[edge.side];
      var fromKey = tileKey(edge.x, edge.y);
      var toKey = off ? tileKey(edge.x + off.dx, edge.y + off.dy) : null;
      if (fromKey === key || toKey === key) {
        delete state.diggableEdges[edgeId];
        removed++;
      }
    }
    return removed;
  }

  function rememberDiggable(x, y, sourceTile) {
    state.diggables = state.diggables || {};
    var key = tileKey(x, y);
    if (!state.diggables[key]) {
      state.diggables[key] = {
        x: x,
        y: y,
        firstSeenAt: Date.now()
      };
    }
    if (sourceTile) {
      state.diggables[key].directions = sourceTile.directions;
      state.diggables[key].rawKeys = Object.keys(sourceTile).join(',');
      state.diggables[key].confirmed = sourceTile.diggable === true || tileText(sourceTile).indexOf('BREAK') >= 0;
    }
    return state.diggables[key];
  }

  function wallsFromDirections(directions, type) {
    var walls = { n: false, e: false, s: false, w: false };
    if (type === 'wall' || type === 'diggable_wall') {
      return { n: true, e: true, s: true, w: true };
    }
    if (typeof directions === 'number') {
      for (var side in OFFSETS) {
        var bit = learnedDirBits[side];
        if (bit && (directions & bit) === 0) walls[side] = true;
      }
    }
    return walls;
  }

  function movementSide(from, to) {
    var dx = to.x - from.x;
    var dy = to.y - from.y;
    if (dx === 1 && dy === 0) return 'e';
    if (dx === -1 && dy === 0) return 'w';
    if (dx === 0 && dy === 1) return 's';
    if (dx === 0 && dy === -1) return 'n';
    return null;
  }

  function edgeKey(x, y, side) {
    return tileKey(x, y) + ':' + side;
  }

  function canonicalEdgeKey(x, y, side) {
    var off = OFFSETS[side];
    if (!off) return edgeKey(x, y, side);
    if (side === 'n' || side === 'w') {
      return edgeKey(x + off.dx, y + off.dy, off.opposite);
    }
    return edgeKey(x, y, side);
  }

  function rememberDiggableEdge(from, to) {
    var side = movementSide(from, to);
    if (!side) return null;
    state.diggableEdges = state.diggableEdges || {};
    var key = canonicalEdgeKey(from.x, from.y, side);
    if (!state.diggableEdges[key]) {
      state.diggableEdges[key] = {
        x: from.x,
        y: from.y,
        side: side,
        firstSeenAt: Date.now()
      };
    }
    markOpenEdge(from, to);
    return state.diggableEdges[key];
  }

  function rememberDiggableEdgeSide(x, y, side) {
    var off = OFFSETS[side];
    if (!off) return null;
    return rememberDiggableEdge({ x: x, y: y }, { x: x + off.dx, y: y + off.dy });
  }

  function rememberWalkedEdge(from, to) {
    var side = movementSide(from, to);
    if (!side) return null;
    state.walkedEdges = state.walkedEdges || {};
    var key = canonicalEdgeKey(from.x, from.y, side);
    state.walkedEdges[key] = true;
    return key;
  }

  function isWalkedEdge(x, y, side) {
    state.walkedEdges = state.walkedEdges || {};
    return !!state.walkedEdges[canonicalEdgeKey(x, y, side)];
  }

  function rememberBrokenVisibleEdges(visible) {
    if (!visible || !visible.length || !state || !state.tiles) return 0;
    var remembered = 0;
    for (var i = 0; i < visible.length; i++) {
      var next = visible[i];
      if (!next || typeof next.directions !== 'number') continue;
      var nextType = classifyTile(next);
      var nextIsTraversable = nextType !== 'wall' && nextType !== 'diggable_wall';
      var old = state.tiles[tileKey(next.x, next.y)];
      if (!old && !nextIsTraversable) continue;
      for (var side in OFFSETS) {
        var bit = learnedDirBits[side];
        if (!bit) continue;
        var wasClosed = !!(old && typeof old.directions === 'number' && (old.directions & bit) === 0);
        if (!wasClosed && nextIsTraversable && state.blockedEdges && state.blockedEdges[edgeKey(next.x, next.y, side)]) {
          wasClosed = true;
        }
        var isOpen = (next.directions & bit) !== 0;
        if (wasClosed && isOpen) {
          if (rememberDiggableEdgeSide(next.x, next.y, side)) remembered++;
        }
      }
    }
    return remembered;
  }

  function markOpenEdge(from, to) {
    var side = movementSide(from, to);
    if (!side) return;
    state.openEdges = state.openEdges || {};
    state.blockedEdges = state.blockedEdges || {};
    var a = edgeKey(from.x, from.y, side);
    var b = edgeKey(to.x, to.y, OFFSETS[side].opposite);
    state.openEdges[a] = true;
    state.openEdges[b] = true;
    delete state.blockedEdges[a];
    delete state.blockedEdges[b];
  }

  function markBlockedEdge(tile, side, kind) {
    state.openEdges = state.openEdges || {};
    state.blockedEdges = state.blockedEdges || {};
    var off = OFFSETS[side];
    if (off) {
      var neighbor = state.tiles[tileKey(tile.x + off.dx, tile.y + off.dy)];
      if (isTraversableTile(neighbor) && isWalkedEdge(tile.x, tile.y, side)) {
        markOpenEdge(tile, { x: tile.x + off.dx, y: tile.y + off.dy });
        return;
      }
    }
    var key = edgeKey(tile.x, tile.y, side);
    if (state.openEdges[key] && isWalkedEdge(tile.x, tile.y, side)) return;
    delete state.openEdges[key];
    state.blockedEdges[key] = kind || 'wall';
  }

  function forceBlockedEdge(tile, side, kind) {
    state.openEdges = state.openEdges || {};
    state.blockedEdges = state.blockedEdges || {};
    var off = OFFSETS[side];
    var a = edgeKey(tile.x, tile.y, side);
    if (state.openEdges[a] && isWalkedEdge(tile.x, tile.y, side)) return;
    delete state.openEdges[a];
    if (off) {
      var b = edgeKey(tile.x + off.dx, tile.y + off.dy, off.opposite);
      if (state.openEdges[b] && isWalkedEdge(tile.x, tile.y, side)) return;
      delete state.openEdges[b];
    }
    state.blockedEdges[a] = kind || 'wall';
  }

  function reconcileOpenEdgesForTile(tile) {
    if (!tile || !isTraversableTile(tile)) return;
    var key = tileKey(tile.x, tile.y);
    for (var side in OFFSETS) {
      var off = OFFSETS[side];
      var neighborKey = tileKey(tile.x + off.dx, tile.y + off.dy);
      var neighbor = state.tiles[neighborKey];
      if (isWalkedEdge(tile.x, tile.y, side)) {
        markOpenEdge(tile, { x: tile.x + off.dx, y: tile.y + off.dy });
        continue;
      }
      if (state.brokenDiggables && state.brokenDiggables[key]) {
        continue;
      }
      var bit = learnedDirBits[side];
      if (typeof tile.directions === 'number' && bit && (tile.directions & bit) === 0) {
        forceBlockedEdge(tile, side, tile.diggable ? 'diggable_wall' : 'wall');
      } else if (typeof tile.directions === 'number' && bit && (tile.directions & bit) !== 0 &&
          canTrustOpenDirections(tile, neighbor)) {
        markOpenEdge(tile, { x: tile.x + off.dx, y: tile.y + off.dy });
      } else if (isTraversableTile(neighbor) &&
          hasUnreliableDirections(tile) && hasUnreliableDirections(neighbor)) {
        forceBlockedEdge(tile, side, tile.diggable ? 'diggable_wall' : 'wall');
      }
    }
  }

  function isEdgeOpen(tile, side) {
    return !!(state.openEdges && state.openEdges[edgeKey(tile.x, tile.y, side)]);
  }

  function getBlockedEdgeKind(tile, side) {
    return state.blockedEdges && state.blockedEdges[edgeKey(tile.x, tile.y, side)];
  }

  function sideOpenByDirections(tile, side) {
    if (!tile || typeof tile.directions !== 'number') return false;
    var bit = learnedDirBits[side];
    return !!(bit && (tile.directions & bit) !== 0);
  }

  function hasUnreliableDirections(tile) {
    if (!tile) return false;
    return !!(tile.directionUnreliable || tile.shiny || isShiny(tile.item) ||
      (state.shinies && state.shinies[tileKey(tile.x, tile.y)]));
  }

  function canTrustOpenDirections(tile, neighbor) {
    return isTraversableTile(tile) && isTraversableTile(neighbor) &&
      !hasUnreliableDirections(tile) && !hasUnreliableDirections(neighbor);
  }

  function ensureFloorTile(x, y, source) {
    var key = tileKey(x, y);
    var tile = state.tiles && state.tiles[key];
    if (!tile) {
      tile = state.tiles[key] = {
        x: x,
        y: y,
        type: 'floor',
        directions: null,
        diggable: false,
        seen: 1,
        source: source || 'marker',
        walls: { n: false, e: false, s: false, w: false },
        wallKinds: {}
      };
    }
    return tile;
  }

  function rebuildShinyPairWalls() {
    if (!state) return;
    var markers = {};
    state.savedMarkerPairEdges = state.savedMarkerPairEdges || {};
    state.markerPairEdges = Object.assign({}, state.savedMarkerPairEdges);

    function addMarker(marker, source) {
      if (!marker || typeof marker.x !== 'number' || typeof marker.y !== 'number') return;
      var key = tileKey(marker.x, marker.y);
      markers[key] = {
        x: marker.x,
        y: marker.y,
        source: source
      };
      var tile = ensureFloorTile(marker.x, marker.y, source);
      tile.directionUnreliable = true;
      if (source === 'shiny') tile.shiny = true;
      if (source === 'diggable') tile.diggableMarker = true;
    }

    for (var shinyKey in state.shinies || {}) {
      addMarker(state.shinies[shinyKey], 'shiny');
    }
    for (var digKey in state.diggables || {}) {
      addMarker(state.diggables[digKey], 'diggable');
    }

    for (var key in markers) {
      var marker = markers[key];
      for (var side in OFFSETS) {
        if (side !== 'e' && side !== 's') continue;
        var off = OFFSETS[side];
        var otherKey = tileKey(marker.x + off.dx, marker.y + off.dy);
        var other = markers[otherKey];
        if (!other || isWalkedEdge(marker.x, marker.y, side)) continue;
        var tile = ensureFloorTile(marker.x, marker.y, marker.source);
        forceBlockedEdge(tile, side, 'wall');
        var edgeId = canonicalEdgeKey(marker.x, marker.y, side);
        var edge = {
          x: marker.x,
          y: marker.y,
          side: side
        };
        state.markerPairEdges[edgeId] = edge;
        state.savedMarkerPairEdges[edgeId] = edge;
      }
    }
  }

  function clearOpenEdge(tile, side) {
    if (!tile || !side) return;
    state.openEdges = state.openEdges || {};
    var off = OFFSETS[side];
    delete state.openEdges[edgeKey(tile.x, tile.y, side)];
    if (off) {
      delete state.openEdges[edgeKey(tile.x + off.dx, tile.y + off.dy, off.opposite)];
    }
  }

  function markVisibleWallEdge(wallTile, kind) {
    if (!wallTile || !state || !state.tiles) return;
    state.blockedEdges = state.blockedEdges || {};
    for (var side in OFFSETS) {
      var off = OFFSETS[side];
      var neighborKey = tileKey(wallTile.x + off.dx, wallTile.y + off.dy);
      var neighbor = state.tiles[neighborKey];
      if (!isTraversableTile(neighbor)) continue;
      var neighborSide = off.opposite;
      if (state.walked && state.walked[neighborKey] && state.walked[tileKey(wallTile.x, wallTile.y)]) continue;
      if (hasUnreliableDirections(neighbor)) clearOpenEdge(neighbor, neighborSide);
      state.blockedEdges[edgeKey(neighbor.x, neighbor.y, neighborSide)] = kind || 'wall';
    }
  }

  function sideClosedByDirections(tile, side) {
    if (!tile || typeof tile.directions !== 'number') return false;
    var bit = learnedDirBits[side];
    return !!(bit && (tile.directions & bit) === 0);
  }

  function clearBlockedEdge(tile, side) {
    if (!tile || !side) return;
    state.blockedEdges = state.blockedEdges || {};
    var off = OFFSETS[side];
    delete state.blockedEdges[edgeKey(tile.x, tile.y, side)];
    if (off) {
      delete state.blockedEdges[edgeKey(tile.x + off.dx, tile.y + off.dy, off.opposite)];
    }
  }

  function pruneContradictoryBlockedEdges() {
    if (!state || !state.blockedEdges || !state.tiles) return 0;
    var removed = 0;
    for (var key in state.blockedEdges) {
      var parts = key.split(':');
      if (parts.length !== 2) continue;
      var coords = parts[0].split(',');
      var side = parts[1];
      var off = OFFSETS[side];
      if (!off || coords.length !== 2) continue;
      var x = parseInt(coords[0], 10);
      var y = parseInt(coords[1], 10);
      var tile = state.tiles[tileKey(x, y)];
      var neighbor = state.tiles[tileKey(x + off.dx, y + off.dy)];
      if (isTraversableTile(tile) && isTraversableTile(neighbor) &&
          !hasUnreliableDirections(tile) && !hasUnreliableDirections(neighbor) &&
          sideOpenByDirections(tile, side) &&
          sideOpenByDirections(neighbor, off.opposite)) {
        delete state.blockedEdges[key];
        delete state.blockedEdges[edgeKey(x + off.dx, y + off.dy, off.opposite)];
        removed++;
      }
    }
    return removed;
  }

  function findDirectionConflicts(scopeKeys) {
    var rows = [];
    if (!state || !state.tiles) return rows;
    scopeKeys = scopeKeys || state.tiles;
    for (var key in scopeKeys) {
      var tile = state.tiles[key];
      if (!tile || !isTraversableTile(tile)) continue;
      for (var side in OFFSETS) {
        if (side === 'n' || side === 'w') continue;
        var off = OFFSETS[side];
        var neighborKey = tileKey(tile.x + off.dx, tile.y + off.dy);
        var neighbor = state.tiles[neighborKey];
        if (!neighbor || !isTraversableTile(neighbor)) continue;
        var opposite = off.opposite;
        var tileClosed = sideClosedByDirections(tile, side);
        var neighborClosed = sideClosedByDirections(neighbor, opposite);
        var tileOpen = sideOpenByDirections(tile, side);
        var neighborOpen = sideOpenByDirections(neighbor, opposite);
        if (tileClosed !== neighborClosed || tileOpen !== neighborOpen) {
          var eKey = edgeKey(tile.x, tile.y, side);
          rows.push({
            edge: eKey,
            a: { x: tile.x, y: tile.y, directions: tile.directions, closed: tileClosed, open: tileOpen, shiny: !!tile.shiny, item: tile.item || null },
            b: { x: neighbor.x, y: neighbor.y, directions: neighbor.directions, closed: neighborClosed, open: neighborOpen, shiny: !!neighbor.shiny, item: neighbor.item || null },
            blocked: state.blockedEdges && state.blockedEdges[eKey] || null,
            openEdge: !!(state.openEdges && state.openEdges[eKey])
          });
        }
      }
    }
    return rows;
  }

  function pruneContradictoryOpenEdges() {
    if (!state || !state.openEdges || !state.tiles) return 0;
    var removed = 0;
    for (var key in state.openEdges) {
      var parts = key.split(':');
      if (parts.length !== 2) continue;
      var coords = parts[0].split(',');
      var side = parts[1];
      var off = OFFSETS[side];
      if (!off || coords.length !== 2) continue;
      var x = parseInt(coords[0], 10);
      var y = parseInt(coords[1], 10);
      var tile = state.tiles[tileKey(x, y)];
      var neighbor = state.tiles[tileKey(x + off.dx, y + off.dy)];
      if ((hasUnreliableDirections(tile) || hasUnreliableDirections(neighbor)) &&
          !isWalkedEdge(x, y, side)) {
        delete state.openEdges[key];
        delete state.openEdges[edgeKey(x + off.dx, y + off.dy, off.opposite)];
        removed++;
        continue;
      }
      if (sideClosedByDirections(tile, side) ||
          sideClosedByDirections(neighbor, off.opposite)) {
        delete state.openEdges[key];
        delete state.openEdges[edgeKey(x + off.dx, y + off.dy, off.opposite)];
        removed++;
      }
    }
    return removed;
  }

  function edgeOpenByEitherTile(tile, side) {
    if (!tile || !isTraversableTile(tile)) return false;
    if (sideOpenByDirections(tile, side)) return true;
    var off = OFFSETS[side];
    if (!off) return false;
    var neighbor = state.tiles[tileKey(tile.x + off.dx, tile.y + off.dy)];
    return isTraversableTile(neighbor) && sideOpenByDirections(neighbor, off.opposite);
  }

  function getVisibleWallKind(tile, side) {
    if (!tile || !state || !state.tiles) return null;
    var off = OFFSETS[side];
    if (!off) return null;
    return null;
  }

  function clearBlockedEdgesAround(cx, cy, radius) {
    state.blockedEdges = state.blockedEdges || {};
    for (var y = cy - radius; y <= cy + radius; y++) {
      for (var x = cx - radius; x <= cx + radius; x++) {
        for (var side in OFFSETS) {
          delete state.blockedEdges[edgeKey(x, y, side)];
        }
      }
    }
  }

  function learnDirectionBit(side, directions) {
    if (!side || learnedDirBits[side] || typeof directions !== 'number') return;
    var existing = directionBitCandidates[side] || [2, 4, 8, 16];
    var remaining = [];
    for (var i = 0; i < existing.length; i++) {
      if ((directions & existing[i]) !== 0) {
        remaining.push(existing[i]);
      }
    }
    for (var other in learnedDirBits) {
      var learned = learnedDirBits[other];
      remaining = remaining.filter(function(bit) { return bit !== learned; });
    }
    directionBitCandidates[side] = remaining;
    if (remaining.length === 1) {
      learnedDirBits[side] = remaining[0];
      console.log('CM learned direction bit:', side, remaining[0]);
    }
  }

  function getTileFromVisible(visible, x, y) {
    if (!visible) return null;
    for (var i = 0; i < visible.length; i++) {
      if (visible[i].x === x && visible[i].y === y) return visible[i];
    }
    return null;
  }

  function isWallTile(t) {
    return t && (t.type === 'wall' || t.type === 'diggable_wall');
  }

  function isTraversableTile(t) {
    return t && !isWallTile(t);
  }

  function isRouteDiggableTile(t) {
    if (!t) return false;
    if (t.type === 'diggable_wall' || t.diggable === true) return true;
    return !!(state.diggables && state.diggables[tileKey(t.x, t.y)]);
  }

  function routeNodeAt(x, y) {
    var key = tileKey(x, y);
    var tile = state.tiles && state.tiles[key];
    if (tile) return tile;
    if (state.shinies && state.shinies[key]) return { x: x, y: y, type: 'floor', shiny: true, source: 'shiny' };
    if (state.walked && state.walked[key]) return { x: x, y: y, type: 'floor', source: 'walked' };
    if (state.diggables && state.diggables[key]) return { x: x, y: y, type: 'diggable_wall', diggable: true, source: 'diggable' };
    return null;
  }

  function isRoutePassableTile(t) {
    return !!(t && (isTraversableTile(t) || isRouteDiggableTile(t)));
  }

  function isRouteDiggableEdge(x, y, side) {
    var off = OFFSETS[side];
    if (!off) return false;
    var blocked = state.blockedEdges && (
      state.blockedEdges[edgeKey(x, y, side)] ||
      state.blockedEdges[edgeKey(x + off.dx, y + off.dy, off.opposite)]
    );
    if (blocked === 'diggable_wall') return true;
    return !!(state.diggableEdges && state.diggableEdges[canonicalEdgeKey(x, y, side)]);
  }

  function routeBlockedEdgeKind(tile, next, side) {
    if (!tile || !next || !side || isWalkedEdge(tile.x, tile.y, side)) return null;
    var off = OFFSETS[side];
    if (!off) return null;
    var canonical = canonicalEdgeKey(tile.x, tile.y, side);
    if (state.markerPairEdges && state.markerPairEdges[canonical]) return 'wall';
    if (state.savedMarkerPairEdges && state.savedMarkerPairEdges[canonical]) return 'wall';
    var blockedA = state.blockedEdges && state.blockedEdges[edgeKey(tile.x, tile.y, side)];
    var blockedB = state.blockedEdges && state.blockedEdges[edgeKey(next.x, next.y, off.opposite)];
    if (blockedA || blockedB) return blockedA || blockedB;
    if (sideClosedByDirections(tile, side) || sideClosedByDirections(next, off.opposite)) {
      return isRouteDiggableTile(tile) || isRouteDiggableTile(next) ? 'diggable_wall' : 'wall';
    }
    return null;
  }

  function routeOpenStepCost(tile, side) {
    var off = OFFSETS[side];
    if (!off || !tile) return null;
    var next = routeNodeAt(tile.x + off.dx, tile.y + off.dy);
    if (!isRoutePassableTile(next)) return null;
    if (routeBlockedEdgeKind(tile, next, side)) return null;
    if (isTraversableTile(tile) && isTraversableTile(next)) {
      if (!edgeOpenByEitherTile(tile, side) && !isWalkedEdge(tile.x, tile.y, side) &&
          !(state.openEdges && state.openEdges[edgeKey(tile.x, tile.y, side)])) {
        return null;
      }
    }
    return 1;
  }

  function hasOpenDetourAroundEdge(tile, next, side, maxCost) {
    var blockedEdge = canonicalEdgeKey(tile.x, tile.y, side);
    var startKey = tileKey(tile.x, tile.y);
    var endKey = tileKey(next.x, next.y);
    var dist = {};
    var queue = [{ x: tile.x, y: tile.y, d: 0 }];
    dist[startKey] = 0;

    for (var head = 0; head < queue.length; head++) {
      var cur = queue[head];
      if (cur.d >= maxCost) continue;
      var curTile = routeNodeAt(cur.x, cur.y);
      if (!isRoutePassableTile(curTile)) continue;
      for (var nextSide in OFFSETS) {
        var off = OFFSETS[nextSide];
        if (canonicalEdgeKey(cur.x, cur.y, nextSide) === blockedEdge) continue;
        var step = routeOpenStepCost(curTile, nextSide);
        if (step === null) continue;
        var nx = cur.x + off.dx;
        var ny = cur.y + off.dy;
        var nk = tileKey(nx, ny);
        var nd = cur.d + step;
        if (nd > maxCost) continue;
        if (dist[nk] !== undefined && dist[nk] <= nd) continue;
        if (nk === endKey) return true;
        dist[nk] = nd;
        queue.push({ x: nx, y: ny, d: nd });
      }
    }
    return false;
  }

  function routeStepCost(tile, side) {
    var off = OFFSETS[side];
    if (!off || !tile) return null;
    var next = routeNodeAt(tile.x + off.dx, tile.y + off.dy);
    if (!isRoutePassableTile(next)) return null;
    var blocked = routeBlockedEdgeKind(tile, next, side);
    if (blocked === 'wall') return null;
    var diggableMove = blocked === 'diggable_wall' || isRouteDiggableTile(next) || isRouteDiggableTile(tile) ||
      isRouteDiggableEdge(tile.x, tile.y, side);
    var breakCost = diggableMove ? ROUTE_DIG_COST : 0;
    if (breakCost > 0 && hasOpenDetourAroundEdge(tile, next, side, 1 + breakCost)) return null;
    if (!blocked && isTraversableTile(tile) && isTraversableTile(next)) {
      if (!edgeOpenByEitherTile(tile, side) && !isWalkedEdge(tile.x, tile.y, side) &&
          !(state.openEdges && state.openEdges[edgeKey(tile.x, tile.y, side)])) {
        return null;
      }
    }
    return 1 + breakCost;
  }

  function routeLooseStepCost(tile, side) {
    var off = OFFSETS[side];
    if (!off || !tile) return null;
    var next = routeNodeAt(tile.x + off.dx, tile.y + off.dy);
    if (!isRoutePassableTile(next)) return null;
    var canonical = canonicalEdgeKey(tile.x, tile.y, side);
    if (state.markerPairEdges && state.markerPairEdges[canonical]) return null;
    if (state.savedMarkerPairEdges && state.savedMarkerPairEdges[canonical]) return null;
    var blockedA = state.blockedEdges && state.blockedEdges[edgeKey(tile.x, tile.y, side)];
    var blockedB = state.blockedEdges && state.blockedEdges[edgeKey(next.x, next.y, off.opposite)];
    if (blockedA === 'wall' || blockedB === 'wall') return null;
    var diggableMove = blockedA === 'diggable_wall' || blockedB === 'diggable_wall' ||
      isRouteDiggableTile(next) || isRouteDiggableTile(tile) || isRouteDiggableEdge(tile.x, tile.y, side);
    return 1 + (diggableMove ? ROUTE_DIG_COST : 0);
  }

  function routeTargetKey(target) {
    return target.kind + ':' + tileKey(target.x, target.y);
  }

  function collectRouteTargets() {
    var targets = [];
    var seen = {};
    function addTarget(x, y, kind, item) {
      if (typeof x !== 'number' || typeof y !== 'number') return;
      if (state.pos && state.pos.x === x && state.pos.y === y) return;
      if (kind === 'diggable' && seen['diamond:' + tileKey(x, y)]) return;
      var tile = kind === 'diamond' ? ensureFloorTile(x, y, 'shiny') : routeNodeAt(x, y);
      if (kind === 'diamond' && tile) {
        if (tile.type === 'wall' || tile.type === 'diggable_wall') tile.type = 'floor';
        tile.shiny = true;
        tile.directionUnreliable = true;
        if (item && !tile.item) tile.item = item;
      }
      if (!isRoutePassableTile(tile)) return;
      var value = kind === 'diggable' ? ROUTE_DIGGABLE_VALUE : ROUTE_DIAMOND_VALUE;
      var key = kind + ':' + tileKey(x, y);
      if (seen[key]) return;
      seen[key] = true;
      targets.push({ x: x, y: y, kind: kind, item: item || null, value: value, key: key });
    }
    var shinies = state.shinies || {};
    for (var shinyKey in shinies) {
      var sh = shinies[shinyKey];
      if (!sh) continue;
      addTarget(sh.x, sh.y, 'diamond', sh.item);
    }
    for (var tileId in state.tiles || {}) {
      var tile = state.tiles[tileId];
      if (!tile || typeof tile.x !== 'number' || typeof tile.y !== 'number') continue;
      var visibleItem = tile.item || getVisibleItem(tile);
      if (tile.shiny || isShiny(visibleItem)) {
        addTarget(tile.x, tile.y, 'diamond', visibleItem);
      }
    }
    for (var digKey in state.diggables || {}) {
      var dig = state.diggables[digKey];
      if (!dig || typeof dig.x !== 'number' || typeof dig.y !== 'number') continue;
      addTarget(dig.x, dig.y, 'diggable', dig.item || null);
    }
    return targets;
  }

  function routeTargetKindCounts(targets) {
    var counts = { diamonds: 0, diggables: 0 };
    for (var i = 0; targets && i < targets.length; i++) {
      if (targets[i].kind === 'diamond') counts.diamonds++;
      if (targets[i].kind === 'diggable') counts.diggables++;
    }
    return counts;
  }

  function routeTargetPathKey(target) {
    return tileKey(
      typeof target.routeX === 'number' ? target.routeX : target.x,
      typeof target.routeY === 'number' ? target.routeY : target.y
    );
  }

  function resolveRouteTargetAccess(target, run) {
    var ownKey = tileKey(target.x, target.y);
    if (run.dist[ownKey] !== undefined) {
      return { x: target.x, y: target.y, cost: run.dist[ownKey], accessCost: 0 };
    }
    var best = null;
    for (var side in OFFSETS) {
      var off = OFFSETS[side];
      var nx = target.x + off.dx;
      var ny = target.y + off.dy;
      var nk = tileKey(nx, ny);
      if (run.dist[nk] === undefined) continue;
      var neighbor = routeNodeAt(nx, ny);
      if (!neighbor || !isTraversableTile(neighbor)) continue;
      var accessCost = target.kind === 'diggable' ? ROUTE_DIG_COST : 0;
      var candidate = { x: nx, y: ny, cost: run.dist[nk] + accessCost, accessCost: accessCost };
      if (!best || candidate.cost < best.cost) best = candidate;
    }
    return best;
  }

  function routeTargetDebugStats() {
    var stats = {
      version: CM_SCRIPT_VERSION,
      shinies: 0,
      tileShiny: 0,
      tileShinyItem: 0,
      diggables: 0,
      tiles: Object.keys(state.tiles || {}).length
    };
    for (var shinyKey in state.shinies || {}) {
      var shiny = state.shinies[shinyKey];
      if (shiny && typeof shiny.x === 'number' && typeof shiny.y === 'number') stats.shinies++;
    }
    for (var tileKeyId in state.tiles || {}) {
      var tile = state.tiles[tileKeyId];
      if (!tile) continue;
      if (tile.shiny) stats.tileShiny++;
      if (isShiny(tile.item || getVisibleItem(tile))) stats.tileShinyItem++;
    }
    for (var digKey in state.diggables || {}) {
      if (state.diggables[digKey]) stats.diggables++;
    }
    return stats;
  }

  function routeDijkstra(start, loose) {
    var startKey = tileKey(start.x, start.y);
    var dist = {};
    var prev = {};
    var queue = [];
    dist[startKey] = 0;
    function heapPush(item) {
      queue.push(item);
      var i = queue.length - 1;
      while (i > 0) {
        var parent = Math.floor((i - 1) / 2);
        if (queue[parent].d <= item.d) break;
        queue[i] = queue[parent];
        i = parent;
      }
      queue[i] = item;
    }
    function heapPop() {
      if (!queue.length) return null;
      var top = queue[0];
      var item = queue.pop();
      if (queue.length && item) {
        var i = 0;
        while (true) {
          var left = i * 2 + 1;
          var right = left + 1;
          if (left >= queue.length) break;
          var child = right < queue.length && queue[right].d < queue[left].d ? right : left;
          if (queue[child].d >= item.d) break;
          queue[i] = queue[child];
          i = child;
        }
        queue[i] = item;
      }
      return top;
    }
    heapPush({ key: startKey, x: start.x, y: start.y, d: 0 });
    while (queue.length) {
      var cur = heapPop();
      if (cur.d !== dist[cur.key]) continue;
      var tile = routeNodeAt(cur.x, cur.y);
      if (!isRoutePassableTile(tile)) continue;
      for (var side in OFFSETS) {
        var step = loose ? routeLooseStepCost(tile, side) : routeStepCost(tile, side);
        if (step === null) continue;
        var off = OFFSETS[side];
        var nx = cur.x + off.dx;
        var ny = cur.y + off.dy;
        var nk = tileKey(nx, ny);
        var nd = cur.d + step;
        if (dist[nk] === undefined || nd < dist[nk]) {
          dist[nk] = nd;
          prev[nk] = cur.key;
          heapPush({ key: nk, x: nx, y: ny, d: nd });
        }
      }
    }
    return { dist: dist, prev: prev };
  }

  function reconstructRoutePath(prev, startKey, endKey) {
    var out = [];
    var key = endKey;
    while (key && key !== startKey) {
      var parts = key.split(',');
      out.push({ x: parseInt(parts[0], 10), y: parseInt(parts[1], 10) });
      key = prev[key];
    }
    var startParts = startKey.split(',');
    out.push({ x: parseInt(startParts[0], 10), y: parseInt(startParts[1], 10) });
    out.reverse();
    return out;
  }

  function routeScoreForMask(targets, mask) {
    var score = 0;
    for (var i = 0; i < targets.length; i++) {
      if (mask & (1 << i)) score += targets[i].value;
    }
    return score;
  }

  function routeEnergyBudget() {
    var energy = Number(state.maxEnergy || ROUTE_START_ENERGY);
    return isFinite(energy) && energy > 0 ? energy : ROUTE_START_ENERGY;
  }

  function routeStateBetter(a, b) {
    if (!a) return false;
    if (!b) return true;
    if (a.value !== b.value) return a.value > b.value;
    if ((a.diamonds || 0) !== (b.diamonds || 0)) return (a.diamonds || 0) > (b.diamonds || 0);
    if ((a.order ? a.order.length : 0) !== (b.order ? b.order.length : 0)) {
      return (a.order ? a.order.length : 0) > (b.order ? b.order.length : 0);
    }
    return a.cost < b.cost;
  }

  function planRouteExact(targets, costs, budget) {
    var n = targets.length;
    var states = {};
    states['0:-1'] = { mask: 0, last: -1, cost: 0, value: 0, diamonds: 0, prevKey: null };
    var best = states['0:-1'];
    for (var mask = 0; mask < (1 << n); mask++) {
      for (var last = -1; last < n; last++) {
        var key = mask + ':' + last;
        var current = states[key];
        if (!current) continue;
        for (var next = 0; next < n; next++) {
          if (mask & (1 << next)) continue;
          var moveCost = last < 0 ? costs.start[next] : costs.matrix[last][next];
          if (moveCost === undefined) continue;
          var pickups = last < 0 ? costs.startPickups[next] : costs.matrixPickups[last][next];
          var nextMask = mask;
          var gain = 0;
          var diamondGain = 0;
          for (var p = 0; pickups && p < pickups.length; p++) {
            if (!(nextMask & (1 << pickups[p]))) {
              gain += targets[pickups[p]].value;
              if (targets[pickups[p]].kind === 'diamond') diamondGain++;
              nextMask |= (1 << pickups[p]);
            }
          }
          if (!(nextMask & (1 << next))) {
            gain += targets[next].value;
            if (targets[next].kind === 'diamond') diamondGain++;
            nextMask |= (1 << next);
          }
          var nextKey = nextMask + ':' + next;
          var nextCost = current.cost + moveCost;
          if (budget !== undefined && nextCost > budget) continue;
          if (!states[nextKey] || nextCost < states[nextKey].cost) {
            states[nextKey] = {
              mask: nextMask,
              last: next,
              cost: nextCost,
              value: current.value + gain,
              diamonds: (current.diamonds || 0) + diamondGain,
              prevKey: key
            };
            if (routeStateBetter(states[nextKey], best)) best = states[nextKey];
          }
        }
      }
    }
    return { best: best || states['0:-1'], states: states };
  }

  function planRouteGreedy(targets, costs, budget) {
    var remaining = {};
    var count = 0;
    for (var i = 0; i < targets.length; i++) {
      remaining[i] = true;
      count++;
    }
    var order = [];
    var last = -1;
    var totalCost = 0;
    while (count > 0) {
      var bestIndex = -1;
      var bestRank = Infinity;
      var bestMoveCost = 0;
      for (var next in remaining) {
        var index = parseInt(next, 10);
        var moveCost = last < 0 ? costs.start[index] : costs.matrix[last][index];
        if (moveCost === undefined) continue;
        if (budget !== undefined && totalCost + moveCost > budget) continue;
        var pickups = last < 0 ? costs.startPickups[index] : costs.matrixPickups[last][index];
        var gain = 0;
        for (var p = 0; pickups && p < pickups.length; p++) {
          if (remaining[pickups[p]]) gain += targets[pickups[p]].value;
        }
        var rank = moveCost / Math.max(0.1, gain);
        if (rank < bestRank) {
          bestRank = rank;
          bestIndex = index;
          bestMoveCost = moveCost;
        }
      }
      if (bestIndex < 0) break;
      order.push(bestIndex);
      totalCost += bestMoveCost;
      var picked = last < 0 ? costs.startPickups[bestIndex] : costs.matrixPickups[last][bestIndex];
      for (var pickedIndex = 0; picked && pickedIndex < picked.length; pickedIndex++) {
        if (remaining[picked[pickedIndex]]) {
          delete remaining[picked[pickedIndex]];
          count--;
        }
      }
      if (remaining[bestIndex]) {
        delete remaining[bestIndex];
        count--;
      }
      last = bestIndex;
    }
    return { best: { order: order, cost: totalCost, value: order.reduce(function(sum, index) {
      return sum + targets[index].value;
    }, 0) } };
  }

  function planRouteBeam(targets, costs, budget) {
    var n = targets.length;
    var beam = [{ order: [], used: {}, last: -1, cost: 0, value: 0, diamonds: 0 }];
    var best = beam[0];

    for (var depth = 0; depth < n; depth++) {
      var candidates = [];
      var seenStates = {};
      for (var i = 0; i < beam.length; i++) {
        var current = beam[i];
        for (var next = 0; next < n; next++) {
          if (current.used[next]) continue;
          var moveCost = current.last < 0 ? costs.start[next] : costs.matrix[current.last][next];
          if (moveCost === undefined) continue;
          var nextCost = current.cost + moveCost;
          if (budget !== undefined && nextCost > budget) continue;
          var used = Object.assign({}, current.used);
          var pickups = current.last < 0 ? costs.startPickups[next] : costs.matrixPickups[current.last][next];
          var gain = 0;
          var diamondGain = 0;
          for (var p = 0; pickups && p < pickups.length; p++) {
            if (!used[pickups[p]]) {
              used[pickups[p]] = true;
              gain += targets[pickups[p]].value;
              if (targets[pickups[p]].kind === 'diamond') diamondGain++;
            }
          }
          if (!used[next]) {
            used[next] = true;
            gain += targets[next].value;
            if (targets[next].kind === 'diamond') diamondGain++;
          }
          var order = current.order.concat(next);
          var usedKeys = Object.keys(used).sort(function(a, b) { return parseInt(a, 10) - parseInt(b, 10); });
          var stateKey = usedKeys.join(',') + ':' + next;
          var candidate = {
            order: order,
            used: used,
            last: next,
            cost: nextCost,
            value: current.value + gain,
            diamonds: (current.diamonds || 0) + diamondGain
          };
          var oldIndex = seenStates[stateKey];
          if (oldIndex === undefined) {
            seenStates[stateKey] = candidates.length;
            candidates.push(candidate);
          } else if (routeStateBetter(candidate, candidates[oldIndex])) {
            candidates[oldIndex] = candidate;
          }
          if (routeStateBetter(candidate, best)) best = candidate;
        }
      }
      if (!candidates.length) break;
      candidates.sort(function(a, b) {
        if (a.value !== b.value) return b.value - a.value;
        if ((a.diamonds || 0) !== (b.diamonds || 0)) return (b.diamonds || 0) - (a.diamonds || 0);
        var ar = a.cost / Math.max(0.1, a.value);
        var br = b.cost / Math.max(0.1, b.value);
        if (ar !== br) return ar - br;
        if (a.order.length !== b.order.length) return b.order.length - a.order.length;
        return a.cost - b.cost;
      });
      beam = candidates.slice(0, ROUTE_BEAM_WIDTH);
    }

    return { best: { order: best.order, cost: best.cost, value: best.value, diamonds: best.diamonds || 0 }, beam: true };
  }

  function routePickupStats(targets, pickups, used, fallbackIndex) {
    var seen = {};
    var out = { value: 0, diamonds: 0, indexes: [] };
    function add(index) {
      if (index === undefined || index === null || used[index] || seen[index]) return;
      seen[index] = true;
      out.indexes.push(index);
      out.value += targets[index].value;
      if (targets[index].kind === 'diamond') out.diamonds++;
    }
    for (var i = 0; pickups && i < pickups.length; i++) add(pickups[i]);
    add(fallbackIndex);
    return out;
  }

  function planRouteClusterGreedy(targets, costs, budget) {
    var used = {};
    var usedCount = 0;
    var order = [];
    var last = -1;
    var totalCost = 0;
    var totalValue = 0;
    var totalDiamonds = 0;

    while (usedCount < targets.length) {
      var best = null;
      for (var next = 0; next < targets.length; next++) {
        if (used[next]) continue;
        var moveCost = last < 0 ? costs.start[next] : costs.matrix[last][next];
        if (moveCost === undefined) continue;
        if (budget !== undefined && totalCost + moveCost > budget) continue;

        var pickups = last < 0 ? costs.startPickups[next] : costs.matrixPickups[last][next];
        var stats = routePickupStats(targets, pickups, used, next);
        if (stats.value <= 0) continue;

        var clusterBonus = 0;
        for (var nearby = 0; nearby < targets.length; nearby++) {
          if (used[nearby] || nearby === next) continue;
          var nearCost = costs.matrix[next] && costs.matrix[next][nearby];
          if (nearCost === undefined || nearCost > ROUTE_CLUSTER_RADIUS) continue;
          clusterBonus += targets[nearby].value * (1 - nearCost / (ROUTE_CLUSTER_RADIUS + 1)) * 0.35;
        }

        var valueNow = stats.value;
        var rank = moveCost / Math.max(0.1, valueNow + clusterBonus);
        var candidate = {
          index: next,
          cost: moveCost,
          value: valueNow,
          diamonds: stats.diamonds,
          rank: rank,
          pickups: stats.indexes
        };
        if (!best ||
            candidate.rank < best.rank ||
            (Math.abs(candidate.rank - best.rank) < 0.001 && candidate.diamonds > best.diamonds) ||
            (Math.abs(candidate.rank - best.rank) < 0.001 && candidate.cost < best.cost)) {
          best = candidate;
        }
      }

      if (!best) break;
      order.push(best.index);
      totalCost += best.cost;
      totalValue += best.value;
      totalDiamonds += best.diamonds;
      for (var p = 0; p < best.pickups.length; p++) {
        if (!used[best.pickups[p]]) {
          used[best.pickups[p]] = true;
          usedCount++;
        }
      }
      if (!used[best.index]) {
        used[best.index] = true;
        usedCount++;
      }
      last = best.index;
    }

    return { best: { order: order, cost: totalCost, value: totalValue, diamonds: totalDiamonds }, cluster: true };
  }

  function routeMoveCost(fromIndex, toIndex, costs) {
    return fromIndex < 0 ? costs.start[toIndex] : costs.matrix[fromIndex][toIndex];
  }

  function routeOrderCost(order, costs) {
    var total = 0;
    var last = -1;
    for (var i = 0; i < order.length; i++) {
      var moveCost = routeMoveCost(last, order[i], costs);
      if (moveCost === undefined) return Infinity;
      total += moveCost;
      last = order[i];
    }
    return total;
  }

  function routeOrderValue(order, targets) {
    var value = 0;
    for (var i = 0; i < order.length; i++) value += targets[order[i]].value;
    return value;
  }

  function buildNearestRouteOrder(targets, costs, firstTarget, budget) {
    var remaining = {};
    for (var i = 0; i < targets.length; i++) remaining[i] = true;
    var order = [];
    var last = -1;
    var totalCost = 0;

    if (typeof firstTarget === 'number' && remaining[firstTarget]) {
      var firstCost = routeMoveCost(-1, firstTarget, costs);
      if (firstCost !== undefined && (budget === undefined || firstCost <= budget)) {
        order.push(firstTarget);
        delete remaining[firstTarget];
        last = firstTarget;
        totalCost = firstCost;
      }
    }

    while (true) {
      var bestIndex = -1;
      var bestRank = Infinity;
      for (var next in remaining) {
        var index = parseInt(next, 10);
        var moveCost = routeMoveCost(last, index, costs);
        if (moveCost === undefined) continue;
        if (budget !== undefined && totalCost + moveCost > budget) continue;
        var rank = moveCost / Math.max(0.1, targets[index].value);
        if (rank < bestRank) {
          bestRank = rank;
          bestIndex = index;
        }
      }
      if (bestIndex < 0) break;
      order.push(bestIndex);
      totalCost += routeMoveCost(last, bestIndex, costs);
      delete remaining[bestIndex];
      last = bestIndex;
    }

    return order;
  }

  function chooseBetterRouteOrder(a, b, targets, costs, budget) {
    if (!a || !a.order) return b;
    if (!b || !b.order) return a;
    if (budget !== undefined) {
      var aOk = a.cost <= budget;
      var bOk = b.cost <= budget;
      if (aOk !== bOk) return bOk ? b : a;
    }
    if (b.value > a.value) return b;
    if (b.value < a.value) return a;
    if (b.order.length > a.order.length) return b;
    if (b.order.length < a.order.length) return a;
    return b.cost + 0.001 < a.cost ? b : a;
  }

  function improveRouteOrder(order, targets, costs, budget) {
    order = (order || []).slice();
    if (order.length < 3) {
      return { order: order, cost: routeOrderCost(order, costs), value: routeOrderValue(order, targets) };
    }

    var bestCost = routeOrderCost(order, costs);
    var improved = true;
    var passes = 0;

    while (improved && passes < 8) {
      improved = false;
      passes++;

      for (var i = 0; i < order.length - 1; i++) {
        for (var j = i + 1; j < order.length; j++) {
          var candidate = order.slice(0, i)
            .concat(order.slice(i, j + 1).reverse())
            .concat(order.slice(j + 1));
          var cost = routeOrderCost(candidate, costs);
          if (budget !== undefined && cost > budget) continue;
          if (cost + 0.001 < bestCost) {
            order = candidate;
            bestCost = cost;
            improved = true;
          }
        }
      }

      for (var from = 0; from < order.length; from++) {
        var moved = order[from];
        var without = order.slice(0, from).concat(order.slice(from + 1));
        for (var to = 0; to <= without.length; to++) {
          if (to === from || to === from + 1) continue;
          var relocated = without.slice(0, to).concat([moved], without.slice(to));
          var relocatedCost = routeOrderCost(relocated, costs);
          if (budget !== undefined && relocatedCost > budget) continue;
          if (relocatedCost + 0.001 < bestCost) {
            order = relocated;
            bestCost = relocatedCost;
            improved = true;
          }
        }
      }
    }

    return { order: order, cost: bestCost, value: routeOrderValue(order, targets) };
  }

  function optimizeRouteOrder(order, targets, costs, budget) {
    var candidates = [order || []];
    candidates.push(buildNearestRouteOrder(targets, costs, undefined, budget));

    var firstChoices = [];
    for (var i = 0; i < targets.length; i++) {
      var startCost = routeMoveCost(-1, i, costs);
      if (budget !== undefined && startCost > budget) continue;
      if (startCost !== undefined) firstChoices.push({ index: i, rank: startCost / Math.max(0.1, targets[i].value) });
    }
    firstChoices.sort(function(a, b) { return a.rank - b.rank; });
    for (var f = 0; f < Math.min(16, firstChoices.length); f++) {
      candidates.push(buildNearestRouteOrder(targets, costs, firstChoices[f].index, budget));
    }

    var best = null;
    for (var c = 0; c < candidates.length; c++) {
      var improved = improveRouteOrder(candidates[c], targets, costs, budget);
      best = chooseBetterRouteOrder(best, improved, targets, costs, budget);
    }
    return best || { order: order || [], cost: routeOrderCost(order || [], costs), value: routeOrderValue(order || [], targets) };
  }

  function routeOrderUsesSameTargets(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    var seen = {};
    for (var i = 0; i < a.length; i++) seen[a[i]] = (seen[a[i]] || 0) + 1;
    for (var j = 0; j < b.length; j++) {
      if (!seen[b[j]]) return false;
      seen[b[j]]--;
    }
    return true;
  }

  function buildRoutePlanFromOrder(targets, order, dijkstraRuns, startKey) {
    var fullPath = [];
    var fromKey = startKey;
    for (var i = 0; i < order.length; i++) {
      var target = targets[order[i]];
      var toKey = routeTargetPathKey(target);
      var run = i === 0 ? dijkstraRuns.start : dijkstraRuns.targets[order[i - 1]];
      var segment = reconstructRoutePath(run.prev, fromKey, toKey);
      if (fullPath.length) segment.shift();
      fullPath = fullPath.concat(segment);
      fromKey = toKey;
    }
    return fullPath;
  }

  function routeTargetListsByTile(targets) {
    var byTile = {};
    for (var i = 0; i < targets.length; i++) {
      var key = routeTargetPathKey(targets[i]);
      if (!byTile[key]) byTile[key] = [];
      byTile[key].push(i);
    }
    return byTile;
  }

  function collectRouteTargetsAlongPath(targets, path) {
    var byTile = routeTargetListsByTile(targets);
    var picked = {};
    var out = [];
    for (var i = 0; i < path.length; i++) {
      var list = byTile[tileKey(path[i].x, path[i].y)];
      if (!list) continue;
      list.sort(function(a, b) {
        if (targets[a].kind === targets[b].kind) return a - b;
        return targets[a].kind === 'diamond' ? -1 : 1;
      });
      for (var j = 0; j < list.length; j++) {
        var index = list[j];
        if (picked[index]) continue;
        picked[index] = true;
        var t = Object.assign({}, targets[index]);
        t.order = out.length + 1;
        out.push(t);
      }
    }
    return out;
  }

  function routePickupIndexesForLeg(targetsByTile, prev, fromKey, toKey) {
    var segment = reconstructRoutePath(prev, fromKey, toKey);
    var picked = {};
    var out = [];
    for (var i = 0; i < segment.length; i++) {
      var list = targetsByTile[tileKey(segment[i].x, segment[i].y)];
      if (!list) continue;
      for (var j = 0; j < list.length; j++) {
        if (picked[list[j]]) continue;
        picked[list[j]] = true;
        out.push(list[j]);
      }
    }
    return out;
  }

  function buildRouteCosts(targets, start, startRun, startKey, budget, loose) {
    var reachable = [];
    for (var i = 0; i < targets.length; i++) {
      var access = resolveRouteTargetAccess(targets[i], startRun);
      if (!access) continue;
      if (budget !== undefined && access.cost > budget) continue;
      var copy = Object.assign({}, targets[i]);
      copy.routeX = access.x;
      copy.routeY = access.y;
      copy.accessCost = access.accessCost;
      copy.startCost = access.cost;
      reachable.push(copy);
    }
    reachable.sort(function(a, b) {
      if (a.startCost !== b.startCost) return a.startCost - b.startCost;
      return b.value - a.value;
    });
    if (reachable.length > ROUTE_MULTI_TARGET_LIMIT) {
      reachable = reachable.slice(0, ROUTE_MULTI_TARGET_LIMIT);
    }

    var targetsByTile = routeTargetListsByTile(reachable);
    var costs = { start: [], startPickups: [], matrix: [], matrixPickups: [] };
    var dijkstraRuns = { start: startRun, targets: [] };

    for (var s = 0; s < reachable.length; s++) {
      var startTargetKey = routeTargetPathKey(reachable[s]);
      costs.start[s] = reachable[s].startCost;
      costs.startPickups[s] = routePickupIndexesForLeg(targetsByTile, startRun.prev, startKey, startTargetKey);
    }

    for (var from = 0; from < reachable.length; from++) {
      var fromTarget = reachable[from];
      var run = routeDijkstra({ x: fromTarget.routeX, y: fromTarget.routeY }, loose);
      dijkstraRuns.targets[from] = run;
      costs.matrix[from] = [];
      costs.matrixPickups[from] = [];
      var fromKey = routeTargetPathKey(fromTarget);
      for (var to = 0; to < reachable.length; to++) {
        if (from === to) continue;
        var toKey = routeTargetPathKey(reachable[to]);
        if (run.dist[toKey] === undefined) continue;
        costs.matrix[from][to] = run.dist[toKey] + (reachable[to].accessCost || 0);
        costs.matrixPickups[from][to] = routePickupIndexesForLeg(targetsByTile, run.prev, fromKey, toKey);
      }
    }

    return { targets: reachable, costs: costs, dijkstraRuns: dijkstraRuns };
  }

  function collectRewardZonePoints() {
    var points = [];
    for (var shinyKey in state.shinies || {}) {
      var sh = state.shinies[shinyKey];
      if (typeof sh.x === 'number' && typeof sh.y === 'number') {
        points.push({ x: sh.x, y: sh.y, key: 'd:' + shinyKey, kind: 'diamond', weight: 1 });
      }
    }
    for (var digKey in state.diggables || {}) {
      var dig = state.diggables[digKey];
      if (typeof dig.x === 'number' && typeof dig.y === 'number') {
        points.push({ x: dig.x, y: dig.y, key: 'g:' + digKey, kind: 'diggable', weight: ROUTE_ZONE_DIGGABLE_WEIGHT });
      }
    }
    for (var hazardKey in state.hazards || {}) {
      var h = state.hazards[hazardKey];
      if (typeof h.x === 'number' && typeof h.y === 'number') {
        points.push({ x: h.x, y: h.y, key: 'e:' + hazardKey, kind: 'energy', weight: ROUTE_ZONE_ENERGY_WEIGHT });
      }
    }
    return points;
  }

  function scoreRewardZoneAt(points, cx, cy) {
    var score = 0;
    var diamonds = 0;
    var diggables = 0;
    var energy = 0;
    var wx = 0;
    var wy = 0;
    var totalWeight = 0;
    var members = {};
    var memberCount = 0;
    for (var i = 0; i < points.length; i++) {
      var dx = points[i].x - cx;
      var dy = points[i].y - cy;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > ROUTE_ZONE_RADIUS) continue;
      var closeness = 1 - dist / (ROUTE_ZONE_RADIUS + 1);
      var weight = points[i].weight * closeness;
      score += weight;
      totalWeight += weight;
      wx += points[i].x * weight;
      wy += points[i].y * weight;
      members[points[i].key] = true;
      memberCount++;
      if (points[i].kind === 'diamond') diamonds++;
      else if (points[i].kind === 'diggable') diggables++;
      else energy++;
    }
    return {
      x: cx,
      y: cy,
      score: score,
      diamonds: diamonds,
      diggables: diggables,
      energy: energy,
      points: memberCount,
      members: members,
      centroidX: totalWeight ? wx / totalWeight : cx,
      centroidY: totalWeight ? wy / totalWeight : cy
    };
  }

  function computeRewardZones() {
    var points = collectRewardZonePoints();
    var candidatesByKey = {};
    var zones = [];
    for (var i = 0; i < points.length; i++) {
      for (var y = points[i].y - ROUTE_ZONE_RADIUS; y <= points[i].y + ROUTE_ZONE_RADIUS; y++) {
        for (var x = points[i].x - ROUTE_ZONE_RADIUS; x <= points[i].x + ROUTE_ZONE_RADIUS; x++) {
          var dx = x - points[i].x;
          var dy = y - points[i].y;
          if (dx * dx + dy * dy > ROUTE_ZONE_RADIUS * ROUTE_ZONE_RADIUS) continue;
          candidatesByKey[tileKey(x, y)] = { x: x, y: y };
        }
      }
    }
    for (var candidateKey in candidatesByKey) {
      var candidate = candidatesByKey[candidateKey];
      var zone = scoreRewardZoneAt(points, candidate.x, candidate.y);
      var refined = scoreRewardZoneAt(points, Math.round(zone.centroidX), Math.round(zone.centroidY));
      if (refined.score > zone.score || (Math.abs(refined.score - zone.score) < 0.001 && refined.diamonds > zone.diamonds)) {
        zone = refined;
      }
      if (zone.score < ROUTE_ZONE_MIN_SCORE) continue;
      if (zone.diamonds + zone.diggables < ROUTE_ZONE_MIN_DIAMONDS) continue;
      if (zone.points < ROUTE_ZONE_MIN_POINTS) continue;
      zones.push(zone);
    }
    zones.sort(function(a, b) {
      if (Math.abs(a.score - b.score) > 0.001) return b.score - a.score;
      if (a.diggables !== b.diggables) return b.diggables - a.diggables;
      if (a.diamonds !== b.diamonds) return b.diamonds - a.diamonds;
      return b.energy - a.energy;
    });
    var picked = [];
    for (var z = 0; z < zones.length && picked.length < ROUTE_ZONE_LIMIT; z++) {
      var tooClose = false;
      for (var p = 0; p < picked.length; p++) {
        var zx = zones[z].x - picked[p].x;
        var zy = zones[z].y - picked[p].y;
        if (Math.sqrt(zx * zx + zy * zy) < ROUTE_ZONE_RADIUS * 1.4) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) {
        zones[z].rank = picked.length + 1;
        delete zones[z].members;
        picked.push(zones[z]);
      }
    }
    return picked;
  }

  function computeBestRoutePlan() {
    if (!state.pos) return { error: 'No player position yet', zones: computeRewardZones() };
    var targets = collectRouteTargets();
    if (!targets.length) {
      var targetStats = routeTargetDebugStats();
      return {
        error: 'No resources on known map (v ' + targetStats.version + ', shinies ' + targetStats.shinies +
          ', tileShiny ' + targetStats.tileShiny + ', item ' + targetStats.tileShinyItem +
          ', diggable ' + targetStats.diggables + ', tiles ' + targetStats.tiles + ')',
        zones: computeRewardZones(),
        debug: targetStats
      };
    }
    var start = { x: state.pos.x, y: state.pos.y };
    var startKey = tileKey(start.x, start.y);
    var startRun = routeDijkstra(start);
    var budget = routeEnergyBudget();
    var routeMode = 'strict';
    var routeData = buildRouteCosts(targets, start, startRun, startKey, budget, false);
    if (!routeData.targets.length) {
      routeMode = 'loose';
      startRun = routeDijkstra(start, true);
      routeData = buildRouteCosts(targets, start, startRun, startKey, budget, true);
    }
    if (!routeData.targets.length) {
      var unreachableStats = routeTargetDebugStats();
      return {
        error: 'No reachable resources (v ' + unreachableStats.version + ', resources ' + targets.length +
          ', diggable ' + unreachableStats.diggables + ', tiles ' + unreachableStats.tiles + ', mode ' + routeMode + ')',
        zones: computeRewardZones(),
        debug: unreachableStats
      };
    }

    var rough = planRouteClusterGreedy(routeData.targets, routeData.costs, budget).best;
    var improved = improveRouteOrder(rough.order, routeData.targets, routeData.costs, budget);
    var bestOrder = improved.cost <= budget ? improved : rough;
    if (!bestOrder.order || !bestOrder.order.length) {
      return { error: 'No reachable resources within energy', zones: computeRewardZones() };
    }

    var path = buildRoutePlanFromOrder(routeData.targets, bestOrder.order, routeData.dijkstraRuns, startKey);
    var plannedTargets = collectRouteTargetsAlongPath(routeData.targets, path);
    var plannedKinds = routeTargetKindCounts(plannedTargets);
    var totalKinds = routeTargetKindCounts(targets);
    var plannedScore = plannedTargets.reduce(function(sum, target) {
      return sum + target.value;
    }, 0);
    return {
      targets: plannedTargets,
      path: path,
      zones: computeRewardZones(),
      stats: {
        cost: bestOrder.cost,
        energyBudget: budget,
        score: plannedScore,
        localScore: bestOrder.value,
        localClusterTargets: bestOrder.order.length,
        totalTargets: targets.length,
        plannedTargets: plannedTargets.length,
        plannedDiamonds: plannedKinds.diamonds,
        plannedDiggables: plannedKinds.diggables,
        totalDiamonds: totalKinds.diamonds,
        totalDiggables: totalKinds.diggables,
        exact: false,
        mode: routeMode
      }
    };
  }

  function setRouteStatus(text) {
    var el = document.getElementById('cm-route-status');
    if (el) el.textContent = text || '';
    var btn = document.getElementById('cm-route');
    if (btn && text) btn.title = text;
  }

  function resetDerivedWallState() {
    if (!state || !state.tiles) return;
    for (var key in state.tiles) {
      if (state.tiles[key]) {
        delete state.tiles[key].walls;
        delete state.tiles[key].wallKinds;
        // Canvas/inferred cells proved too noisy for this tileset. Keep API and walked data only.
        if ((state.tiles[key].source === 'vision' || state.tiles[key].source === 'inferred') && !state.walked[key]) {
          delete state.tiles[key];
        } else if ((state.tiles[key].source === 'vision' || state.tiles[key].source === 'inferred') && state.walked[key]) {
          state.tiles[key].type = 'floor';
          state.tiles[key].source = 'walked';
        }
      }
    }
    clearVisionObjects();
  }

  function clearInferredWallTiles() {
    if (!state || !state.tiles) return false;
    var changed = false;
    for (var key in state.tiles) {
      if (state.tiles[key] &&
          (state.tiles[key].source === 'inferred' || state.tiles[key].source === 'vision') &&
          isWallTile(state.tiles[key])) {
        delete state.tiles[key];
        changed = true;
      }
    }
    return changed;
  }

  function clearVisionTiles() {
    if (!state || !state.tiles) return false;
    var changed = false;
    for (var key in state.tiles) {
      if (state.tiles[key] &&
          (state.tiles[key].source === 'vision' || state.tiles[key].source === 'inferred') &&
          !state.walked[key]) {
        delete state.tiles[key];
        changed = true;
      } else if (state.tiles[key] &&
          (state.tiles[key].source === 'vision' || state.tiles[key].source === 'inferred') &&
          state.walked[key]) {
        state.tiles[key].type = 'floor';
        state.tiles[key].source = 'walked';
        state.tiles[key].walls = { n: false, e: false, s: false, w: false };
        state.tiles[key].wallKinds = {};
        changed = true;
      }
    }
    return changed;
  }

  function clearVisionObjects() {
    if (!state) return false;
    var changed = false;
    function clearFrom(bucket) {
      if (!bucket) return;
      for (var key in bucket) {
        var code = bucket[key] && bucket[key].item && bucket[key].item.code;
        if (code === 'VISION_HAZARD') {
          delete bucket[key];
          changed = true;
        }
      }
    }
    clearFrom(state.shinies);
    clearFrom(state.hazards);
    return changed;
  }

  function clearHazardsFromShinies() {
    if (!state || !state.shinies) return false;
    var changed = false;
    for (var key in state.shinies) {
      var shiny = state.shinies[key];
      if (!shiny) continue;
      var tile = state.tiles && state.tiles[key];
      if (isHazard(shiny.item) || (tile && (tile.hazard || isHazard(tile.item)))) {
        delete state.shinies[key];
        if (tile) delete tile.shiny;
        changed = true;
      }
    }
    return changed;
  }

  function clearUnconfirmedWallTiles() {
    if (!state || !state.tiles) return false;
    var changed = false;
    for (var key in state.tiles) {
      var tile = state.tiles[key];
      if (tile && tile.source === 'api' && tile.type === 'wall' && tile.directions === 0 && !tile.diggable) {
        delete state.tiles[key];
        changed = true;
      }
    }
    return changed;
  }

  function sanitizeMapState() {
    var changed = false;
    if (clearVisionTiles()) changed = true;
    if (clearVisionObjects()) changed = true;
    if (clearHazardsFromShinies()) changed = true;
    if (clearUnconfirmedWallTiles()) changed = true;
    state.brokenDiggables = state.brokenDiggables || {};
    state.diggables = state.diggables || {};
    for (var walkedKey in state.walked) {
      var walkedTile = state.tiles && state.tiles[walkedKey];
      if (walkedTile && walkedTile.type === 'diggable_wall') {
        rememberDiggable(walkedTile.x, walkedTile.y, walkedTile);
        markBrokenDiggable(walkedTile.x, walkedTile.y);
      }
    }
    for (var tileKey2 in state.tiles) {
      var digTile = state.tiles[tileKey2];
      if (digTile && digTile.type === 'diggable_wall') {
        rememberDiggable(digTile.x, digTile.y, digTile);
      }
    }
    state.openEdges = state.openEdges || {};
    state.blockedEdges = state.blockedEdges || {};
    pruneContradictoryOpenEdges();
    for (var key in state.tiles) {
      var tile = state.tiles[key];
      if (!tile) continue;
      if (isTraversableTile(tile)) {
        reconcileOpenEdgesForTile(tile);
      }
    }
    rebuildBlockedEdgesFromTiles();
    rebuildShinyPairWalls();
    return changed;
  }

  function mergeWalls(base, next) {
    base = base || { n: false, e: false, s: false, w: false };
    next = next || {};
    base.n = !!next.n;
    base.e = !!next.e;
    base.s = !!next.s;
    base.w = !!next.w;
    return base;
  }

  function drawTileWalls(t, x, y, s) {
    var edgeWalls = {
      n: getVisibleWallKind(t, 'n') || getBlockedEdgeKind(t, 'n'),
      e: getVisibleWallKind(t, 'e') || getBlockedEdgeKind(t, 'e'),
      s: getVisibleWallKind(t, 's') || getBlockedEdgeKind(t, 's'),
      w: getVisibleWallKind(t, 'w') || getBlockedEdgeKind(t, 'w')
    };
    var hasWall = edgeWalls.n || edgeWalls.e || edgeWalls.s || edgeWalls.w;
    if (!hasWall) return;
    var wallKinds = t.wallKinds || {};
    var width = Math.max(3, Math.min(6, s * 0.22));
    var highlightWidth = Math.max(1, width * 0.42);

    function drawSide(side, x1, y1, x2, y2) {
      var kind = edgeWalls[side] || wallKinds[side];
      if (!kind) return;
      var color = '#9b7a68';
      ctx.lineCap = 'butt';
      ctx.strokeStyle = '#050509';
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      ctx.strokeStyle = color;
      ctx.lineWidth = highlightWidth;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    drawSide('n', x, y, x + s, y);
    drawSide('e', x + s, y, x + s, y + s);
    drawSide('s', x, y + s, x + s, y + s);
    drawSide('w', x, y, x, y + s);
  }

  function drawStoredEdgeWall(edge, s) {
    if (!edge) return;
    var x = edge.x * s + view.offX;
    var y = edge.y * s + view.offY;
    var x1 = x, y1 = y, x2 = x, y2 = y;
    if (edge.side === 'n') {
      x2 = x + s;
    } else if (edge.side === 'e') {
      x1 = x + s;
      x2 = x + s;
      y2 = y + s;
    } else if (edge.side === 's') {
      y1 = y + s;
      x2 = x + s;
      y2 = y + s;
    } else if (edge.side === 'w') {
      y2 = y + s;
    } else {
      return;
    }
    var width = Math.max(3, Math.min(6, s * 0.22));
    var highlightWidth = Math.max(1, width * 0.42);
    ctx.lineCap = 'butt';
    ctx.strokeStyle = '#050509';
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.strokeStyle = '#9b7a68';
    ctx.lineWidth = highlightWidth;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function drawGem(cx, cy, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx - r, cy - r * 0.3);
    ctx.lineTo(cx - r * 0.5, cy - r);
    ctx.lineTo(cx + r * 0.5, cy - r);
    ctx.lineTo(cx + r, cy - r * 0.3);
    ctx.lineTo(cx, cy + r);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.5, cy - r);
    ctx.lineTo(cx, cy - r * 0.3);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r, cy - r * 0.3);
    ctx.closePath();
    ctx.fill();
  }

  function drawLightning(cx, cy, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.3, cy - r);
    ctx.lineTo(cx - r * 0.4, cy + r * 0.1);
    ctx.lineTo(cx, cy + r * 0.1);
    ctx.lineTo(cx - r * 0.3, cy + r);
    ctx.lineTo(cx + r * 0.4, cy - r * 0.1);
    ctx.lineTo(cx, cy - r * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#aa8800';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawLadder(cx, cy, r, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.5, cy - r);
    ctx.lineTo(cx - r * 0.5, cy + r);
    ctx.moveTo(cx + r * 0.5, cy - r);
    ctx.lineTo(cx + r * 0.5, cy + r);
    ctx.moveTo(cx - r * 0.5, cy - r * 0.6);
    ctx.lineTo(cx + r * 0.5, cy - r * 0.6);
    ctx.moveTo(cx - r * 0.5, cy);
    ctx.lineTo(cx + r * 0.5, cy);
    ctx.moveTo(cx - r * 0.5, cy + r * 0.6);
    ctx.lineTo(cx + r * 0.5, cy + r * 0.6);
    ctx.stroke();
  }

  function drawRoutePath(s) {
    var plan = state.routePlan;
    if (!plan || !plan.path || plan.path.length < 2) return;
    if (plan.zonesOnly) return;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    function tracePath() {
      ctx.beginPath();
      for (var i = 0; i < plan.path.length; i++) {
        var p = plan.path[i];
        var x = p.x * s + view.offX + s / 2;
        var y = p.y * s + view.offY + s / 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    }

    tracePath();
    ctx.strokeStyle = 'rgba(6, 8, 18, 0.82)';
    ctx.lineWidth = Math.max(5, Math.min(12, s * 0.48));
    ctx.stroke();

    tracePath();
    ctx.strokeStyle = 'rgba(255, 231, 96, 0.95)';
    ctx.lineWidth = Math.max(3, Math.min(8, s * 0.3));
    ctx.stroke();

    tracePath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.lineWidth = Math.max(1, Math.min(3, s * 0.11));
    ctx.stroke();

    var end = plan.path[plan.path.length - 1];
    var prev = plan.path[plan.path.length - 2];
    var ex = end.x * s + view.offX + s / 2;
    var ey = end.y * s + view.offY + s / 2;
    var angle = Math.atan2(end.y - prev.y, end.x - prev.x);
    var arrow = Math.max(7, Math.min(15, s * 0.62));
    ctx.beginPath();
    ctx.moveTo(ex + Math.cos(angle) * arrow, ey + Math.sin(angle) * arrow);
    ctx.lineTo(ex + Math.cos(angle + 2.45) * arrow, ey + Math.sin(angle + 2.45) * arrow);
    ctx.lineTo(ex + Math.cos(angle - 2.45) * arrow, ey + Math.sin(angle - 2.45) * arrow);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 231, 96, 0.95)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(6, 8, 18, 0.9)';
    ctx.lineWidth = Math.max(1, Math.min(3, s * 0.12));
    ctx.stroke();
    ctx.restore();
  }

  function drawMarkerStrokes(s) {
    var strokes = state.markerStrokes || [];
    if (!strokes.length) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 34, 34, 0.95)';
    ctx.lineWidth = Math.max(3, Math.min(8, s * 0.34));
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (var i = 0; i < strokes.length; i++) {
      var points = strokes[i] && strokes[i].points;
      if (!points || !points.length) continue;
      ctx.beginPath();
      for (var j = 0; j < points.length; j++) {
        var x = points[j].x * s + view.offX;
        var y = points[j].y * s + view.offY;
        if (j === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawRewardZones(s) {
    var plan = state.routePlan;
    if (!plan || !plan.zones || !plan.zones.length) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold ' + Math.max(9, Math.min(15, s * 0.52)) + 'px sans-serif';
    for (var i = plan.zones.length - 1; i >= 0; i--) {
      var zone = plan.zones[i];
      var x = zone.x * s + view.offX + s / 2;
      var y = zone.y * s + view.offY + s / 2;
      var radius = ROUTE_ZONE_RADIUS * s;
      if (x + radius < 0 || x - radius > canvas.width || y + radius < 0 || y - radius > canvas.height) continue;
      var alpha = Math.max(0.16, Math.min(0.34, zone.score / 18));
      ctx.fillStyle = 'rgba(255, 210, 64, ' + alpha + ')';
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 238, 128, 0.9)';
      ctx.lineWidth = Math.max(2, Math.min(5, s * 0.16));
      ctx.stroke();

      var badgeRadius = Math.max(8, Math.min(16, s * 0.55));
      ctx.fillStyle = '#ffe66d';
      ctx.beginPath();
      ctx.arc(x, y, badgeRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#171018';
      ctx.lineWidth = Math.max(2, badgeRadius * 0.18);
      ctx.stroke();
      ctx.fillStyle = '#171018';
      ctx.fillText(String(zone.rank), x, y + 0.5);
    }
    ctx.restore();
  }

  function drawRouteLabels(s) {
    var plan = state.routePlan;
    if (!plan || !plan.targets) return;
    if (plan.zonesOnly) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold ' + Math.max(9, Math.min(16, s * 0.58)) + 'px sans-serif';
    for (var i = 0; i < plan.targets.length; i++) {
      var target = plan.targets[i];
      var x = target.x * s + view.offX + s * 0.78;
      var y = target.y * s + view.offY + s * 0.22;
      if (x + s < 0 || x - s > canvas.width || y + s < 0 || y - s > canvas.height) continue;
      var radius = Math.max(6, Math.min(13, s * 0.43));
      ctx.fillStyle = '#00ccff';
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#050509';
      ctx.lineWidth = Math.max(2, radius * 0.18);
      ctx.stroke();
      ctx.fillStyle = '#071018';
      ctx.fillText(String(target.order), x, y + 0.5);
    }
    ctx.restore();
  }

  function render() {
    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    var s = view.scale;
    
    // Draw white border around the full 100x100 map
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(view.offX, view.offY, GRID_SIZE * s, GRID_SIZE * s);

    for (var k in state.tiles) {
      var t = state.tiles[k];
      var isWalked = state.walked[k];
      var x = t.x * s + view.offX, y = t.y * s + view.offY;
      if (x + s < 0 || x > canvas.width || y + s < 0 || y > canvas.height) continue;
      if (t.type === 'wall') {
        ctx.fillStyle = '#5f3d4f';
      } else {
        ctx.fillStyle = isWalked ? 'rgb(100,150,255)' : getColor(t.seen || 1);
      }
      ctx.fillRect(x, y, s, s);
      if (t.type === 'wall') {
        ctx.strokeStyle = '#171018';
        ctx.lineWidth = Math.max(2, Math.min(5, s * 0.28));
        ctx.strokeRect(x + 1, y + 1, Math.max(0, s - 2), Math.max(0, s - 2));
        ctx.strokeStyle = '#b28a77';
        ctx.lineWidth = Math.max(1, Math.min(3, s * 0.14));
        ctx.strokeRect(x + 2, y + 2, Math.max(0, s - 4), Math.max(0, s - 4));
      }
    }

    for (var k in state.walked) {
      if (state.tiles[k]) continue;
      var parts = k.split(',');
      var wx = parseInt(parts[0]), wy = parseInt(parts[1]);
      var x = wx * s + view.offX, y = wy * s + view.offY;
      if (x + s < 0 || x > canvas.width || y + s < 0 || y > canvas.height) continue;
      ctx.fillStyle = 'rgb(100,150,255)';
      ctx.fillRect(x, y, s, s);
    }

    // Thin grid lines
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 0.5;
    for (var k in state.tiles) {
      var t = state.tiles[k];
      var x = t.x * s + view.offX, y = t.y * s + view.offY;
      if (x + s < 0 || x > canvas.width || y + s < 0 || y > canvas.height) continue;
      ctx.strokeRect(x, y, s, s);
    }

    for (var k in state.tiles) {
      var t = state.tiles[k];
      if (isWallTile(t)) continue;
      var x = t.x * s + view.offX, y = t.y * s + view.offY;
      if (x + s < 0 || x > canvas.width || y + s < 0 || y > canvas.height) continue;
      drawTileWalls(t, x, y, s);
    }

    for (var k in state.walked) {
      if (state.tiles[k]) continue;
      var parts = k.split(',');
      var wx = parseInt(parts[0]), wy = parseInt(parts[1]);
      var x = wx * s + view.offX, y = wy * s + view.offY;
      if (x + s < 0 || x > canvas.width || y + s < 0 || y > canvas.height) continue;
      drawTileWalls({ x: wx, y: wy, type: 'floor' }, x, y, s);
    }

    for (var k in state.diggableEdges || {}) {
      drawStoredEdgeWall(state.diggableEdges[k], s);
    }

    for (var k in state.markerPairEdges || {}) {
      drawStoredEdgeWall(state.markerPairEdges[k], s);
    }

    drawRewardZones(s);
    drawRoutePath(s);
    drawMarkerStrokes(s);

    for (var k in state.extracts) {
      var e = state.extracts[k];
      var ex = e.x * s + view.offX + s / 2;
      var ey = e.y * s + view.offY + s / 2;
      drawLadder(ex, ey, s * 0.4, '#8B4513');
    }

    for (var k in state.hazards) {
      var h = state.hazards[k];
      var hx = h.x * s + view.offX + s / 2;
      var hy = h.y * s + view.offY + s / 2;
      drawLightning(hx, hy, s * 0.4, '#ffdd00');
    }

    for (var k in state.shinies) {
      var sh = state.shinies[k];
      var sx = sh.x * s + view.offX + s / 2;
      var sy = sh.y * s + view.offY + s / 2;
      drawGem(sx, sy, s * 0.4, '#00ccff');
    }

    for (var k in state.diggables || {}) {
      var d = state.diggables[k];
      var gx = d.x * s + view.offX + s / 2;
      var gy = d.y * s + view.offY + s / 2;
      if (gx + s < 0 || gx - s > canvas.width || gy + s < 0 || gy - s > canvas.height) continue;
      drawGem(gx, gy, s * 0.4, '#00ccff');
    }

    for (var k in state.tiles) {
      if (state.shinies[k]) continue;
      var t = state.tiles[k];
      if (!t || (!t.shiny && !isShiny(t.item))) continue;
      var tx = t.x * s + view.offX + s / 2;
      var ty = t.y * s + view.offY + s / 2;
      if (tx + s < 0 || tx - s > canvas.width || ty + s < 0 || ty - s > canvas.height) continue;
      drawGem(tx, ty, s * 0.4, '#00ccff');
    }

    drawRouteLabels(s);

    if (state.pos) {
      var px = state.pos.x * s + view.offX + s / 2;
      var py = state.pos.y * s + view.offY + s / 2;
      ctx.fillStyle = '#ff3333';
      ctx.beginPath();
      ctx.arc(px, py, s * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  function center() {
    if (state.pos) {
      view.offX = canvas.width / 2 - state.pos.x * view.scale;
      view.offY = canvas.height / 2 - state.pos.y * view.scale;
    } else {
      view.offX = canvas.width / 2 - (GRID_SIZE / 2) * view.scale;
      view.offY = canvas.height / 2 - (GRID_SIZE / 2) * view.scale;
    }
    render();
  }

  function fit() {
    var tiles = Object.keys(state.tiles);
    if (tiles.length === 0) {
      center();
      return;
    }
    
    // Find bounding box of all tiles
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    tiles.forEach(function(key) {
      var parts = key.split(',');
      var x = parseInt(parts[0]);
      var y = parseInt(parts[1]);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    });
    
    // Add padding
    var padding = 2;
    minX -= padding;
    maxX += padding;
    minY -= padding;
    maxY += padding;
    
    // Calculate scale to fit
    var tileWidth = maxX - minX + 1;
    var tileHeight = maxY - minY + 1;
    var scaleX = canvas.width / tileWidth;
    var scaleY = canvas.height / tileHeight;
    var newScale = Math.min(scaleX, scaleY);
    
    // Clamp scale to reasonable bounds
    newScale = Math.max(4, Math.min(40, newScale));
    view.scale = newScale;
    
    // Center on the bounding box
    var centerX = (minX + maxX) / 2;
    var centerY = (minY + maxY) / 2;
    view.offX = canvas.width / 2 - centerX * view.scale;
    view.offY = canvas.height / 2 - centerY * view.scale;
    
    render();
  }

  function update() {
    document.getElementById('cm-pos').textContent = state.pos ? state.pos.x + ',' + state.pos.y : '-';
    document.getElementById('cm-tiles').textContent = Object.keys(state.tiles).length;
    document.getElementById('cm-steps').textContent = state.totalSteps;
    document.getElementById('cm-shinies').textContent = Object.keys(state.shinies).length;
    document.getElementById('cm-hazards').textContent = Object.keys(state.hazards).length;
    document.getElementById('cm-extracts').textContent = Object.keys(state.extracts).length;
    
    var tilesExplored = Object.keys(state.tiles).length;
    var percent = ((tilesExplored / TOTAL_TILES) * 100).toFixed(2);
    document.getElementById('cm-percent').textContent = percent + '%';
    
    updateCrowdsourceIndicator();
  }

  function addTile(t) {
    var key = tileKey(t.x, t.y);
    var existing = state.tiles[key];
    var isNew = !existing;
    var type = classifyTile(t);
    state.brokenDiggables = state.brokenDiggables || {};
    state.diggables = state.diggables || {};
    if (type === 'diggable_wall') {
      rememberDiggable(t.x, t.y, t);
    } else if (state.diggables[key] && type !== 'wall') {
      type = 'diggable_wall';
      t = Object.assign({}, t, { diggable: true });
    }
    if (type === 'wall' && t.directions === 0 && !t.diggable) {
      if (existing && existing.type === 'wall' && existing.source === 'api') {
        delete state.tiles[key];
      }
      return;
    }
    if (state.walked[key] && type === 'diggable_wall') {
      markBrokenDiggable(t.x, t.y);
    } else if (state.walked[key] && type !== 'wall' && type !== 'diggable_wall') {
      type = 'floor';
    }
    var walls = wallsFromDirections(t.directions, type);
    
    if (existing) {
      existing.seen = (existing.seen || 1) + 1;
      existing.x = t.x;
      existing.y = t.y;
      existing.type = type;
      existing.directions = t.directions;
      existing.diggable = !!t.diggable;
      existing.lastVisibleAt = Date.now();
      existing.rawKeys = Object.keys(t).join(',');
      existing.source = 'api';
      existing.walls = walls;
      existing.wallKinds = {};
    } else {
      state.tiles[key] = {
        x: t.x,
        y: t.y,
        type: type,
        directions: t.directions,
        diggable: !!t.diggable,
        seen: 1,
        lastVisibleAt: Date.now(),
        rawKeys: Object.keys(t).join(','),
        source: 'api',
        walls: walls,
        wallKinds: {}
      };
    }

    if (isTraversableTile(state.tiles[key])) {
      reconcileOpenEdgesForTile(state.tiles[key]);
    }

    recordVisibleItem(t, state.tiles[key]);
    
    // Track for crowdsource
    if (isNew && state.tiles[key].type !== 'wall') {
      trackPendingData(key, 'tile', state.tiles[key]);
    }
  }

  function updateVisibleWallEdges(visible) {
    clearInferredWallTiles();

    var visibleTiles = {};
    visible = visible || [];
    for (var i = 0; i < visible.length; i++) {
      var t = visible[i];
      var key = tileKey(t.x, t.y);
      var type = classifyTile(t);
      visibleTiles[key] = {
        x: t.x,
        y: t.y,
        type: type,
        directions: t.directions,
        diggable: type === 'diggable_wall' && !!t.diggable
      };
    }
    var visibleKeys = {};
    for (var i2 = 0; i2 < visible.length; i2++) {
      visibleKeys[tileKey(visible[i2].x, visible[i2].y)] = true;
    }
    for (var key in visibleKeys) {
      var tile = state.tiles[key];
      if (!tile) continue;
      tile.walls = { n: false, e: false, s: false, w: false };
      tile.wallKinds = {};
    }

    for (var key in visibleTiles) {
      var info = visibleTiles[key];
      var tile = state.tiles[key];
      if (!tile || isWallTile(tile)) continue;

      // Normal stone walls come from floor directions. Diggable walls are passable for extra energy.
    }

    rebuildBlockedEdgesFromTiles();
  }

  function rebuildBlockedEdgesFromTiles() {
    state.blockedEdges = {};
    state.openEdges = state.openEdges || {};
    if (!state.tiles) return;
    pruneContradictoryOpenEdges();
    for (var key in state.tiles) {
      var tile = state.tiles[key];
      if (!tile || !isTraversableTile(tile)) continue;
      for (var side in OFFSETS) {
        var off = OFFSETS[side];
        var neighborKey = tileKey(tile.x + off.dx, tile.y + off.dy);
        var neighbor = state.tiles[neighborKey];
        var bit = learnedDirBits[side];
        if (typeof tile.directions === 'number' && bit && (tile.directions & bit) === 0) {
          forceBlockedEdge(tile, side, tile.diggable ? 'diggable_wall' : 'wall');
          continue;
        }
        if (typeof tile.directions === 'number' && bit && (tile.directions & bit) !== 0 &&
            canTrustOpenDirections(tile, neighbor)) {
          markOpenEdge(tile, { x: tile.x + off.dx, y: tile.y + off.dy });
        } else if (isTraversableTile(neighbor) &&
            hasUnreliableDirections(tile) && hasUnreliableDirections(neighbor)) {
          forceBlockedEdge(tile, side, tile.diggable ? 'diggable_wall' : 'wall');
        }
      }
    }
    rebuildShinyPairWalls();
  }

  function calibrateDirectionBits(visibleTiles) {
    for (var key in visibleTiles) {
      var tile = visibleTiles[key];
      if (!tile || tile.type === 'wall' || tile.type === 'diggable_wall' || typeof tile.directions !== 'number') continue;
      for (var side in OFFSETS) {
        var off = OFFSETS[side];
        var neighbor = visibleTiles[tileKey(tile.x + off.dx, tile.y + off.dy)];
        if (!neighbor || neighbor.type === 'wall' || neighbor.type === 'diggable_wall') continue;
        var candidates = directionBitCandidates[side] || [2, 4, 8, 16];
        directionBitCandidates[side] = candidates.filter(function(bit) {
          return (tile.directions & bit) !== 0;
        });
      }
    }

    var used = {};
    for (var learnedSide in learnedDirBits) used[learnedDirBits[learnedSide]] = true;
    var changed = true;
    while (changed) {
      changed = false;
      for (var side2 in directionBitCandidates) {
        if (learnedDirBits[side2]) continue;
        var remaining = directionBitCandidates[side2].filter(function(bit) { return !used[bit]; });
        directionBitCandidates[side2] = remaining;
        if (remaining.length === 1) {
          learnedDirBits[side2] = remaining[0];
          used[remaining[0]] = true;
          changed = true;
          console.log('CM learned direction bit:', side2, remaining[0]);
        }
      }
    }
  }

  function isHazard(item) {
    if (!item) return false;
    var text = itemText(item);
    return text.indexOf('TRAP') >= 0 || text.indexOf('FENCE') >= 0 ||
           text.indexOf('ELECTRIC') >= 0 || text.indexOf('ENERGY') >= 0 ||
           text.indexOf('LIGHTNING') >= 0 || text.indexOf('POWER') >= 0 ||
           text.indexOf('HAZARD') >= 0;
  }

  function hazardFamily(item) {
    var text = itemText(item);
    if (text.indexOf('ELECTRIC') >= 0 || text.indexOf('ENERGY') >= 0 ||
        text.indexOf('LIGHTNING') >= 0 || text.indexOf('POWER') >= 0) return 'electric';
    if (text.indexOf('TRAP') >= 0) return 'trap';
    if (text.indexOf('FENCE') >= 0 || text.indexOf('HAZARD') >= 0) return 'hazard';
    return 'hazard';
  }

  function removeHazardAt(key) {
    var h = state.hazards && state.hazards[key];
    if (!h) return false;
    var tile = state.tiles && state.tiles[key];
    if (tile) delete tile.hazard;
    delete state.hazards[key];
    return true;
  }

  function upsertHazard(x, y, item, logPrefix) {
    var key = tileKey(x, y);
    var family = hazardFamily(item);
    var text = itemText(item);
    var changed = false;

    for (var existingKey in state.hazards) {
      if (existingKey === key) continue;
      var h = state.hazards[existingKey];
      if (!h) continue;
      var dist = Math.abs((h.x || 0) - x) + Math.abs((h.y || 0) - y);
      if (dist > 1) continue;

      var existingFamily = hazardFamily(h.item);
      var existingText = itemText(h.item);
      var sameFamily = existingFamily === family || !h.item || !item;
      var looksLikeTriggeredUpdate = text.indexOf('TRIGGERED') >= 0 || existingText.indexOf('TRIGGERED') >= 0;
      if (sameFamily || looksLikeTriggeredUpdate) {
        changed = removeHazardAt(existingKey) || changed;
      }
    }

    if (!state.hazards[key]) {
      state.hazards[key] = { x: x, y: y, item: item };
      trackPendingData(key, 'fence', { x: x, y: y });
      console.log(logPrefix + ':', (item && (item.code || item.name)) || 'unknown', 'at', key);
      changed = true;
    } else if (item && !state.hazards[key].item) {
      state.hazards[key].item = item;
      changed = true;
    }

    var tile = state.tiles && state.tiles[key];
    if (state.shinies && state.shinies[key]) {
      delete state.shinies[key];
      changed = true;
    }
    if (tile) {
      tile.hazard = true;
      delete tile.shiny;
    }
    return changed;
  }

  function isShiny(item) {
    if (!item) return false;
    var text = itemText(item);
    if (isHazard(item) || isExtractItem(item)) return false;
    return text.indexOf('SHINY') >= 0 || text.indexOf('TREASURE') >= 0 ||
           text.indexOf('GEM') >= 0 || text.indexOf('COLLECT') >= 0 ||
           text.indexOf('LOOT') >= 0;
  }

  function isExtractItem(item) {
    if (!item) return false;
    var text = itemText(item);
    return text.indexOf('EXTRACT') >= 0 || text.indexOf('EXIT') >= 0 ||
           text.indexOf('STAIR') >= 0 || text.indexOf('STAIRS') >= 0 ||
           text.indexOf('LADDER') >= 0 || text.indexOf('PORTAL') >= 0;
  }

  function upsertExtract(x, y, item, logPrefix) {
    var key = tileKey(x, y);
    if (!state.extracts[key]) {
      state.extracts[key] = { x: x, y: y, item: item || null };
      trackPendingData(key, 'extract', state.extracts[key]);
      console.log(logPrefix + ':', key);
      return true;
    }
    if (item && !state.extracts[key].item) state.extracts[key].item = item;
    return false;
  }

  var visibleDebugLogged = false;

  function itemText(item) {
    if (!item) return '';
    if (typeof item === 'string') return item.toUpperCase();
    var parts = [];
    ['code', 'name', 'message', 'type', 'kind', 'id', 'label', 'title', 'class', 'sprite', 'asset', 'texture'].forEach(function(field) {
      if (item[field] !== undefined && item[field] !== null) parts.push(String(item[field]));
    });
    return parts.join(' ').toUpperCase();
  }

  function itemFromFlag(key, value) {
    if (String(key).toUpperCase() === 'OBJECT' && value === 999) {
      return { code: 'EXIT_OBJECT_999', name: 'Exit' };
    }
    if (value !== true && value !== 1 && value !== 'true') return null;
    var upper = String(key).toUpperCase();
    if (upper.indexOf('ELECTRIC') >= 0 || upper.indexOf('ENERGY') >= 0 ||
        upper.indexOf('LIGHTNING') >= 0 || upper.indexOf('POWER') >= 0 ||
        upper.indexOf('FENCE') >= 0 || upper.indexOf('TRAP') >= 0 || upper.indexOf('HAZARD') >= 0) {
      return { code: upper, name: upper };
    }
    if (upper.indexOf('SHINY') >= 0 || upper.indexOf('TREASURE') >= 0 || upper.indexOf('GEM') >= 0 || upper.indexOf('LOOT') >= 0) {
      return { code: upper, name: upper };
    }
    if (upper.indexOf('EXTRACT') >= 0 || upper.indexOf('EXIT') >= 0 || upper.indexOf('STAIR') >= 0 ||
        upper.indexOf('LADDER') >= 0 || upper.indexOf('PORTAL') >= 0) {
      return { code: upper, name: upper };
    }
    return null;
  }

  function findVisibleItem(value, depth, seen) {
    if (!value || depth > 5) return null;
    seen = seen || [];
    if (typeof value === 'string') {
      var asItem = { name: value };
      return isHazard(asItem) || isShiny(asItem) || isExtractItem(asItem) ? asItem : null;
    }
    if (typeof value !== 'object') return null;
    if (seen.indexOf(value) >= 0) return null;
    seen.push(value);

    if (isHazard(value) || isShiny(value) || isExtractItem(value)) return value;

    var preferred = [
      'item', 'itemFound', 'object', 'entity', 'entities',
      'items', 'objects', 'treasure', 'treasures', 'shiny', 'shinies',
      'hazard', 'hazards', 'fence', 'electric', 'trap',
      'extract', 'extracts', 'exit', 'exits', 'stairs', 'stair', 'ladder', 'portal',
      'pickup', 'pickups', 'collectible', 'collectibles', 'loot', 'contents'
    ];
    for (var i = 0; i < preferred.length; i++) {
      var key = preferred[i];
      if (value[key] === undefined || value[key] === null) continue;
      var flagged = itemFromFlag(key, value[key]);
      if (flagged) return flagged;
      var foundPreferred = findVisibleItem(value[key], depth + 1, seen);
      if (foundPreferred) return foundPreferred;
    }

    if (Array.isArray(value)) {
      for (var a = 0; a < value.length; a++) {
        var foundArray = findVisibleItem(value[a], depth + 1, seen);
        if (foundArray) return foundArray;
      }
      return null;
    }

    for (var prop in value) {
      if (prop === 'x' || prop === 'y' || prop === 'directions' || prop === 'diggable') continue;
      var flaggedProp = itemFromFlag(prop, value[prop]);
      if (flaggedProp) return flaggedProp;
      var found = findVisibleItem(value[prop], depth + 1, seen);
      if (found) return found;
    }

    return null;
  }

  function getVisibleItem(t) {
    var item = findVisibleItem(t, 0);
    if (!item && !visibleDebugLogged) {
      visibleDebugLogged = true;
      try {
        console.log('CM visible sample:', JSON.stringify(t));
      } catch (e) {
        console.log('CM visible sample keys:', Object.keys(t || {}));
      }
    }
    return item;
  }

  function recordVisibleItem(sourceTile, storedTile) {
    if (sourceTile && sourceTile.object === 999) {
      if (storedTile) storedTile.extract = true;
      upsertExtract(sourceTile.x, sourceTile.y, { code: 'EXIT_OBJECT_999', name: 'Exit' }, 'CM VISIBLE EXTRACT');
      return;
    }
    var item = getVisibleItem(sourceTile);
    if (!item) return;

    recordMapObject(sourceTile.x, sourceTile.y, item, null, storedTile);
  }

  function contextText(path, item) {
    return (String(path || '') + ' ' + itemText(item)).toUpperCase();
  }

  function objectKindFromContext(path, item) {
    var text = contextText(path, item);
    if (text.indexOf('TRAP') >= 0 || text.indexOf('FENCE') >= 0 ||
        text.indexOf('ELECTRIC') >= 0 || text.indexOf('ENERGY') >= 0 ||
        text.indexOf('LIGHTNING') >= 0 || text.indexOf('POWER') >= 0 ||
        text.indexOf('HAZARD') >= 0) {
      return 'hazard';
    }
    if (text.indexOf('EXTRACT') >= 0 || text.indexOf('EXIT') >= 0 ||
        text.indexOf('STAIR') >= 0 || text.indexOf('LADDER') >= 0 ||
        text.indexOf('PORTAL') >= 0) {
      return 'extract';
    }
    if (text.indexOf('SHINY') >= 0 || text.indexOf('TREASURE') >= 0 ||
        text.indexOf('GEM') >= 0 || text.indexOf('COLLECT') >= 0 ||
        text.indexOf('LOOT') >= 0 || text.indexOf('PICKUP') >= 0) {
      return 'shiny';
    }
    return null;
  }

  function positionToXY(position) {
    if (typeof position !== 'number') return null;
    return { x: position % 100, y: Math.floor(position / 100) };
  }

  function getObjectXY(obj, fallbackXY) {
    if (!obj || typeof obj !== 'object') return fallbackXY || null;
    if (typeof obj.x === 'number' && typeof obj.y === 'number') return { x: obj.x, y: obj.y };
    if (obj.location && typeof obj.location.x === 'number' && typeof obj.location.y === 'number') {
      return { x: obj.location.x, y: obj.location.y };
    }
    if (obj.coords && typeof obj.coords.x === 'number' && typeof obj.coords.y === 'number') {
      return { x: obj.coords.x, y: obj.coords.y };
    }
    if (typeof obj.position === 'number') return positionToXY(obj.position);
    if (typeof obj.tile === 'number') return positionToXY(obj.tile);
    if (typeof obj.tileIndex === 'number') return positionToXY(obj.tileIndex);
    return fallbackXY || null;
  }

  function recordMapObject(x, y, item, forcedKind, storedTile) {
    var kind = forcedKind || (isHazard(item) ? 'hazard' : (isShiny(item) ? 'shiny' : null));
    if (!kind && isExtractItem(item)) kind = 'extract';
    if (!kind) return false;

    if (isHazard(item)) {
      kind = 'hazard';
    }

    var key = tileKey(x, y);
    if (!storedTile) storedTile = state.tiles[key];
    if (storedTile) storedTile.item = item;

    if (kind === 'hazard') {
      if (storedTile) storedTile.hazard = true;
      upsertHazard(x, y, item, 'CM VISIBLE HAZARD');
      return true;
    }

    if (kind === 'shiny') {
      storedTile = ensureFloorTile(x, y, 'shiny');
      if (storedTile) {
        storedTile.shiny = true;
        storedTile.directionUnreliable = true;
        storedTile.item = item;
      }
      if (!state.shinies[key]) {
        state.shinies[key] = { x: x, y: y, item: item };
        trackPendingData(key, 'shiny', { x: x, y: y });
        console.log('CM VISIBLE SHINY:', item.code || item.name || 'unknown', 'at', key);
      }
      rebuildShinyPairWalls();
      return true;
    }

    if (kind === 'extract') {
      if (storedTile) storedTile.extract = true;
      upsertExtract(x, y, item, 'CM VISIBLE EXTRACT');
      return true;
    }

    return false;
  }

  function scanGameObjects(value, path, fallbackXY, seen, depth) {
    if (!value || depth > 7 || typeof value !== 'object') return;
    seen = seen || [];
    if (seen.indexOf(value) >= 0) return;
    seen.push(value);

    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) {
        scanGameObjects(value[i], path, fallbackXY, seen, depth + 1);
      }
      return;
    }

    var xy = getObjectXY(value, fallbackXY);
    var kind = objectKindFromContext(path, value);
    if (xy && kind) {
      recordMapObject(xy.x, xy.y, value, kind, state.tiles[tileKey(xy.x, xy.y)]);
    }

    var childFallbackXY = fallbackXY;
    if (typeof value.x === 'number' && typeof value.y === 'number') {
      childFallbackXY = { x: value.x, y: value.y };
    }

    for (var prop in value) {
      if (prop === 'directions' || prop === 'diggable') continue;
      var child = value[prop];
      var childPath = path ? path + '.' + prop : prop;
      var flagged = itemFromFlag(prop, child);
      if (flagged && childFallbackXY) {
        recordMapObject(childFallbackXY.x, childFallbackXY.y, flagged, objectKindFromContext(prop, flagged), state.tiles[tileKey(childFallbackXY.x, childFallbackXY.y)]);
      }
      scanGameObjects(child, childPath, childFallbackXY, seen, depth + 1);
    }
  }

  var visionConfig = {
    enabled: true,
    scanTiles: false,
    scanEdges: false,
    tileSize: 64,
    offsetX: 0,
    offsetY: 0,
    autoCenter: true,
    playerCenterYOffset: 8,
    scanRadius: 5,
    sampleStep: 6,
    lastScanTime: 0,
    minScanInterval: 450
  };

  function getGameCanvas() {
    var canvases = Array.prototype.slice.call(document.querySelectorAll('canvas'));
    return canvases
      .filter(function(c) { return c.id !== 'cm-canvas' && c.width >= 300 && c.height >= 300; })
      .sort(function(a, b) { return (b.width * b.height) - (a.width * a.height); })[0] || null;
  }

  function frameLooksBlank(frame) {
    if (!frame || !frame.pixels) return true;
    var nonBlack = 0;
    var total = 0;
    var stepX = Math.max(1, Math.floor(frame.width / 12));
    var stepY = Math.max(1, Math.floor(frame.height / 12));
    for (var y = Math.floor(stepY / 2); y < frame.height; y += stepY) {
      for (var x = Math.floor(stepX / 2); x < frame.width; x += stepX) {
        var p = getFramePixel(frame, x, y);
        total++;
        if (p[3] > 10 && (p[0] > 8 || p[1] > 8 || p[2] > 8)) nonBlack++;
      }
    }
    return total > 0 && nonBlack === 0;
  }

  function getVisionFrame() {
    var gameCanvas = getGameCanvas();
    if (!gameCanvas) return null;

    try {
      var snapshot = document.createElement('canvas');
      snapshot.width = gameCanvas.width;
      snapshot.height = gameCanvas.height;
      var snapshotCtx = snapshot.getContext('2d', { willReadFrequently: true });
      snapshotCtx.drawImage(gameCanvas, 0, 0, snapshot.width, snapshot.height);
      var image = snapshotCtx.getImageData(0, 0, snapshot.width, snapshot.height);
      var snapshotFrame = {
        canvas: gameCanvas,
        width: snapshot.width,
        height: snapshot.height,
        pixels: image.data,
        flippedY: false,
        mode: 'snapshot'
      };
      if (!frameLooksBlank(snapshotFrame)) return snapshotFrame;
    } catch (snapErr) {}

    try {
      var ctx2 = gameCanvas.getContext('2d', { willReadFrequently: true });
      if (ctx2 && ctx2.getImageData) {
        var image2 = ctx2.getImageData(0, 0, gameCanvas.width, gameCanvas.height);
        var frame2d = {
          canvas: gameCanvas,
          width: gameCanvas.width,
          height: gameCanvas.height,
          pixels: image2.data,
          flippedY: false,
          mode: '2d'
        };
        if (!frameLooksBlank(frame2d)) return frame2d;
      }
    } catch (ctxErr) {}

    var gl = null;
    try {
      gl = gameCanvas.getContext('webgl2', { preserveDrawingBuffer: true }) ||
           gameCanvas.getContext('webgl', { preserveDrawingBuffer: true }) ||
           gameCanvas.getContext('experimental-webgl', { preserveDrawingBuffer: true });
    } catch (e) {}

    if (!gl) return null;

    try {
      var pixels = new Uint8Array(gameCanvas.width * gameCanvas.height * 4);
      gl.readPixels(0, 0, gameCanvas.width, gameCanvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return {
        canvas: gameCanvas,
        width: gameCanvas.width,
        height: gameCanvas.height,
        pixels: pixels,
        flippedY: true,
        mode: 'webgl'
      };
    } catch (e) {
      console.log('CM vision scan failed:', e.message);
      return null;
    }
  }

  function getFramePixel(frame, x, y) {
    x = Math.max(0, Math.min(frame.width - 1, Math.round(x)));
    y = Math.max(0, Math.min(frame.height - 1, Math.round(y)));
    var sourceY = frame.flippedY ? frame.height - 1 - y : y;
    var i = (sourceY * frame.width + x) * 4;
    return [frame.pixels[i], frame.pixels[i + 1], frame.pixels[i + 2], frame.pixels[i + 3]];
  }

  function classifyVisionStats(stats) {
    var total = Math.max(1, stats.total);
    var dark = stats.dark / total;
    var bright = stats.bright / total;
    var rock = stats.rock / total;
    var floor = stats.floor / total;

    // Fog of war: mostly dark pixels
    if (dark > 0.65) return { type: 'unknown' };
    // Too few visible pixels to classify
    if (stats.nonDarkCount < 3) return { type: 'unknown' };
    // Rock walls are mostly mauve/brown stone pixels. Floor has the same palette,
    // so require a strong rock majority instead of using variance alone.
    if (rock > 0.34 && floor < 0.42 && dark < 0.45) return { type: 'wall' };
    if (bright > 0.24 && rock > 0.24 && floor < 0.35 && dark < 0.45) return { type: 'wall' };
    // Floor: visible pixels, not too dark, with enough floor-colored samples.
    if ((floor > 0.18 || stats.mean > 38) && dark < 0.55) return { type: 'floor' };
    return { type: 'unknown' };
  }

  function scanVisionTileStats(frame, sx, sy) {
    var half = visionConfig.tileSize * 0.26;
    var stats = { total: 0, dark: 0, purple: 0, electric: 0, bright: 0, rock: 0, floor: 0 };
    var brightnesses = [];

    for (var y = sy - half; y <= sy + half; y += visionConfig.sampleStep) {
      for (var x = sx - half; x <= sx + half; x += visionConfig.sampleStep) {
        var p = getFramePixel(frame, x, y);
        var r = p[0], g = p[1], b = p[2], a = p[3];
        if (a < 10) continue;
        stats.total++;

        var brightness = (r + g + b) / 3;
        brightnesses.push(brightness);

        if (r < 24 && g < 24 && b < 24) stats.dark++;
        if (r > 165 && b > 150 && g < 100) stats.purple++;
        if ((b > 170 && r < 120 && g < 180) || (r > 180 && g > 150 && b < 80)) stats.electric++;
        if (r > 170 && g > 170 && b > 170) stats.bright++;
        if (isRockPixel(p)) stats.rock++;
        if (isFloorPixel(p)) stats.floor++;
      }
    }

    // Calculate brightness variance excluding dark (fog) pixels
    var nonDark = [];
    for (var i = 0; i < brightnesses.length; i++) {
      if (brightnesses[i] > 20) nonDark.push(brightnesses[i]);
    }
    var mean = 0, variance = 0;
    if (nonDark.length > 3) {
      for (var j = 0; j < nonDark.length; j++) mean += nonDark[j];
      mean /= nonDark.length;
      for (var k = 0; k < nonDark.length; k++) {
        var diff = nonDark[k] - mean;
        variance += diff * diff;
      }
      variance /= nonDark.length;
    }
    stats.mean = mean;
    stats.variance = variance;
    stats.nonDarkCount = nonDark.length;

    return stats;
  }

  function scanVisionTile(frame, sx, sy) {
    var stats = scanVisionTileStats(frame, sx, sy);
    return classifyVisionStats(stats);
  }

  // Diagnostic: run cmDiagVision() in console to see actual values for surrounding tiles
  window.cmDiagVision = function() {
    if (!state.pos) { console.log('CM diag: no position'); return; }
    var frame = getVisionFrame();
    if (!frame) { console.log('CM diag: no frame'); return; }
    var playerCenter = findPlayerCenter(frame);
    var centerX = (playerCenter ? playerCenter.x : frame.width / 2) + visionConfig.offsetX;
    var centerY = (playerCenter ? playerCenter.y : frame.height / 2) + visionConfig.offsetY;
    var results = [];
    for (var dy = -3; dy <= 3; dy++) {
      for (var dx = -3; dx <= 3; dx++) {
        var sx = centerX + dx * visionConfig.tileSize;
        var sy = centerY + dy * visionConfig.tileSize;
        if (sx < 0 || sx >= frame.width || sy < 0 || sy >= frame.height) continue;
        var rawStats = scanVisionTileStats(frame, sx, sy);
        var vision = (dx === 0 && dy === 0) ? { type: 'floor' } : scanVisionTile(frame, sx, sy);
        results.push({
          dx: dx, dy: dy,
          wx: state.pos.x + dx, wy: state.pos.y + dy,
          type: vision.type,
          mean: Math.round(rawStats.mean),
          variance: Math.round(rawStats.variance),
          rock: Math.round((rawStats.rock / Math.max(1, rawStats.total)) * 100) + '%',
          floor: Math.round((rawStats.floor / Math.max(1, rawStats.total)) * 100) + '%',
          dark: rawStats.dark + '/' + rawStats.total,
          nonDark: rawStats.nonDarkCount
        });
      }
    }
    console.table(results);
    return results;
  };

  function isRockPixel(p) {
    var r = p[0], g = p[1], b = p[2], a = p[3];
    if (a < 10) return false;
    if (r < 20 && g < 20 && b < 20) return false;
    return r > 45 && r < 165 &&
           g > 30 && g < 115 &&
           b > 35 && b < 130 &&
           Math.abs(r - b) < 75 &&
           r >= g;
  }

  function isFloorPixel(p) {
    var r = p[0], g = p[1], b = p[2], a = p[3];
    if (a < 10) return false;
    return r > 65 && r < 170 &&
           g > 30 && g < 115 &&
           b > 30 && b < 115 &&
           r > g + 8;
  }

  function isPlayerPixel(p) {
    var r = p[0], g = p[1], b = p[2], a = p[3];
    if (a < 10) return false;
    var redSuit = r > 145 && g < 95 && b < 95 && r > g * 1.7 && r > b * 1.6;
    var yellowHelmet = r > 170 && g > 120 && g < 210 && b < 95;
    var whiteTrim = r > 205 && g > 205 && b > 190;
    return redSuit || yellowHelmet || whiteTrim;
  }

  function findPlayerCenter(frame) {
    var minX = frame.width * 0.25;
    var maxX = frame.width * 0.75;
    var minY = frame.height * 0.25;
    var maxY = frame.height * 0.75;
    var sumX = 0, sumY = 0, count = 0;
    var minSeenX = Infinity, maxSeenX = -Infinity, minSeenY = Infinity, maxSeenY = -Infinity;

    for (var y = minY; y <= maxY; y += 3) {
      for (var x = minX; x <= maxX; x += 3) {
        var p = getFramePixel(frame, x, y);
        if (!isPlayerPixel(p)) continue;
        sumX += x;
        sumY += y;
        count++;
        if (x < minSeenX) minSeenX = x;
        if (x > maxSeenX) maxSeenX = x;
        if (y < minSeenY) minSeenY = y;
        if (y > maxSeenY) maxSeenY = y;
      }
    }

    if (count < 20) return null;

    return {
      x: sumX / count,
      y: (sumY / count) + visionConfig.playerCenterYOffset,
      count: count,
      bounds: {
        x1: minSeenX,
        y1: minSeenY,
        x2: maxSeenX,
        y2: maxSeenY
      }
    };
  }

  function scanVisionEdge(frame, sx, sy, side) {
    var half = visionConfig.tileSize / 2;
    var span = visionConfig.tileSize * 0.44;
    var outside = visionConfig.tileSize * 0.18;
    var band = Math.max(4, visionConfig.tileSize * 0.10);
    var rock = 0, floor = 0, total = 0;
    var edgeX = sx;
    var edgeY = sy;

    if (side === 'w') edgeX = sx - half - outside;
    if (side === 'e') edgeX = sx + half + outside;
    if (side === 'n') edgeY = sy - half - outside;
    if (side === 's') edgeY = sy + half + outside;

    if (side === 'w' || side === 'e') {
      for (var y = sy - span; y <= sy + span; y += visionConfig.sampleStep) {
        for (var dx = -band; dx <= band; dx += 3) {
          var p = getFramePixel(frame, edgeX + dx, y);
          total++;
          if (isRockPixel(p)) rock++;
          if (isFloorPixel(p)) floor++;
        }
      }
    } else {
      for (var x = sx - span; x <= sx + span; x += visionConfig.sampleStep) {
        for (var dy = -band; dy <= band; dy += 3) {
          var p2 = getFramePixel(frame, x, edgeY + dy);
          total++;
          if (isRockPixel(p2)) rock++;
          if (isFloorPixel(p2)) floor++;
        }
      }
    }

    total = Math.max(1, total);
    var rockRatio = rock / total;
    var floorRatio = floor / total;
    return {
      blocked: rockRatio > 0.28 && floorRatio < 0.22 && rock > floor * 1.6,
      rockRatio: rockRatio,
      floorRatio: floorRatio
    };
  }

  function applyVisionTile(wx, wy, vision) {
    if (!vision || vision.type === 'unknown') return false;
    var key = tileKey(wx, wy);
    var existing = state.tiles[key];
    var type = vision.type;
    if (state.walked[key]) type = 'floor';
    if (type === 'wall' || type === 'diggable_wall') return false;

    // Canvas vision is only safe enough to confirm floor. Walls come from API directions.
    if (existing && (existing.source === 'api' || existing.source === 'inferred')) {
      existing.visionSeen = (existing.visionSeen || 0) + 1;
      existing.lastVisionAt = Date.now();
      return false;
    }

    if (!existing) {
      existing = state.tiles[key] = {
        x: wx,
        y: wy,
        type: type,
        directions: null,
        diggable: false,
        seen: 0,
        walls: { n: false, e: false, s: false, w: false },
        wallKinds: {},
        source: 'vision'
      };
    }

    existing.x = wx;
    existing.y = wy;
    existing.type = type;
    existing.visionSeen = (existing.visionSeen || 0) + 1;
    existing.seen = Math.max(existing.seen || 0, existing.visionSeen);
    existing.lastVisionAt = Date.now();

    return true;
  }

  function scanVisionMap(force) {
    if (!visionConfig.enabled || !state.pos) return null;
    var now = Date.now();
    if (!force && now - visionConfig.lastScanTime < visionConfig.minScanInterval) return null;
    visionConfig.lastScanTime = now;

    var frame = getVisionFrame();
    if (!frame) return null;

    var playerCenter = visionConfig.autoCenter ? findPlayerCenter(frame) : null;
    var centerX = (playerCenter ? playerCenter.x : frame.width / 2) + visionConfig.offsetX;
    var centerY = (playerCenter ? playerCenter.y : frame.height / 2) + visionConfig.offsetY;
    var updated = 0;
    if (clearVisionObjects()) updated++;
    if (clearVisionTiles()) updated++;
    if (clearInferredWallTiles()) updated++;
    visionConfig.scanEdges = false;

    // Don't clear blocked edges — API-sourced edges must survive.
    // Open edges from player movement (markOpenEdge) handle dig-through.

    if (visionConfig.scanTiles) {
    for (var dy = -visionConfig.scanRadius; dy <= visionConfig.scanRadius; dy++) {
      for (var dx = -visionConfig.scanRadius; dx <= visionConfig.scanRadius; dx++) {
        var sx = centerX + dx * visionConfig.tileSize;
        var sy = centerY + dy * visionConfig.tileSize;
        if (sx < 0 || sx >= frame.width || sy < 0 || sy >= frame.height) continue;

        var vision = (dx === 0 && dy === 0) ? { type: 'floor' } : scanVisionTile(frame, sx, sy);
        if (applyVisionTile(state.pos.x + dx, state.pos.y + dy, vision)) updated++;
      }
    }
    }

    if (updated > 0) {
      saveState();
      update();
    }

    return { ok: true, updated: updated, width: frame.width, height: frame.height };
  }

  async function process(data) {
    try {
      var g = null;
      if (data && data.data) {
        g = data.data;
      } else if (data && data.visible) {
        g = data;
      }
      if (!g) return;

      window.cmLastGameData = g;
      sanitizeMapState();
      window.cmDumpGameData = function() {
        try {
          console.log('CM last game data:', JSON.stringify(window.cmLastGameData, null, 2));
        } catch (e) {
          console.log('CM last game data:', window.cmLastGameData);
        }
        return window.cmLastGameData;
      };
      window.cmDumpVisible = function() {
        var data = window.cmLastGameData || {};
        var visible = data.visible || [];
        var rows = visible.map(function(t) {
          return {
            x: t.x,
            y: t.y,
            type: classifyTile(t),
            directions: t.directions,
            diggable: !!t.diggable,
            keys: Object.keys(t).join(','),
            raw: t
          };
        });
        console.table(rows.map(function(r) {
          return {
            x: r.x,
            y: r.y,
            type: r.type,
            directions: r.directions,
            diggable: r.diggable,
            keys: r.keys
          };
        }));
        return rows;
      };
      window.cmDebugRouteTargets = function() {
        var targets = collectRouteTargets();
        var stats = routeTargetDebugStats();
        console.log('CM route target debug:', { stats: stats, targets: targets.slice(0, 20) });
        return { stats: stats, count: targets.length, sample: targets.slice(0, 20) };
      };
      window.cmTestCanvasVision = function() {
        var canvases = Array.prototype.slice.call(document.querySelectorAll('canvas'));
        var candidates = canvases
          .filter(function(c) { return c.id !== 'cm-canvas'; })
          .sort(function(a, b) { return (b.width * b.height) - (a.width * a.height); });
        var gameCanvas = candidates[0];
        if (!gameCanvas) {
          console.log('CM vision: no game canvas found');
          return { ok: false, reason: 'no_canvas' };
        }

        var canvasInfo = candidates.map(function(c, index) {
          var rect = c.getBoundingClientRect();
          return {
            index: index,
            id: c.id || '',
            className: String(c.className || ''),
            width: c.width,
            height: c.height,
            cssWidth: Math.round(rect.width),
            cssHeight: Math.round(rect.height)
          };
        });

        var frame = getVisionFrame();
        if (!frame) {
          var noFrame = { ok: false, reason: 'no_readable_frame', canvases: canvasInfo };
          console.log('CM vision:', noFrame);
          return noFrame;
        }

        var center = getFramePixel(frame, Math.floor(frame.width / 2), Math.floor(frame.height / 2));
        var playerCenter = findPlayerCenter(frame);
        var result = {
          ok: true,
          mode: frame.mode,
          blank: frameLooksBlank(frame),
          width: frame.width,
          height: frame.height,
          centerPixel: center,
          playerCenter: playerCenter,
          canvases: canvasInfo
        };
        console.log('CM vision:', result);
        return result;
      };
      window.cmScanVision = function() {
        var result = scanVisionMap(true);
        console.log('CM vision scan:', result);
        return result;
      };
      window.cmRepairMap = function() {
        state.openEdges = {};
        state.blockedEdges = {};
        var changed = sanitizeMapState();
        saveState();
        update();
        console.log('CM repair map:', { ok: true, changed: changed, tiles: Object.keys(state.tiles).length });
        return { ok: true, changed: changed, tiles: Object.keys(state.tiles).length };
      };
      window.cmFixDiggableCage = function(x, y) {
        if (typeof x !== 'number' || typeof y !== 'number') {
          if (!state.pos) return { ok: false, error: 'No x/y and no current position' };
          x = state.pos.x;
          y = state.pos.y;
        }
        var removed = removeDiggableEdgesTouchingTile(x, y);
        saveState();
        render();
        update();
        console.log('CM fixed diggable cage:', { x: x, y: y, removed: removed });
        return { ok: true, x: x, y: y, removed: removed };
      };
      window.cmMarkDiggable = function(x, y) {
        if (typeof x !== 'number' || typeof y !== 'number') {
          if (!state.pos) return { ok: false, error: 'No x/y and no current position' };
          x = state.pos.x;
          y = state.pos.y;
        }
        var key = tileKey(x, y);
        rememberDiggable(x, y, Object.assign({ diggable: true }, state.tiles[key] || { directions: null }));
        markBrokenDiggable(x, y);
        saveState();
        render();
        update();
        console.log('CM marked diggable:', key);
        return { ok: true, x: x, y: y };
      };
      window.cmClearDiggableMarks = function() {
        state.diggables = {};
        state.diggableEdges = {};
        saveState();
        render();
        update();
        console.log('CM cleared diggable marks');
        return { ok: true };
      };
      window.cmMarkDiggableEdge = function(x1, y1, x2, y2) {
        if (typeof x1 !== 'number' || typeof y1 !== 'number' ||
            typeof x2 !== 'number' || typeof y2 !== 'number') {
          return { ok: false, error: 'Use cmMarkDiggableEdge(x1, y1, x2, y2)' };
        }
        var edge = rememberDiggableEdge({ x: x1, y: y1 }, { x: x2, y: y2 });
        if (!edge) return { ok: false, error: 'Tiles must be adjacent' };
        saveState();
        render();
        update();
        console.log('CM marked diggable edge:', edge);
        return { ok: true, edge: edge };
      };
      window.cmMarkExtract = function(x, y) {
        if (typeof x !== 'number' || typeof y !== 'number') {
          if (!state.pos) return { ok: false, error: 'No x/y and no current position' };
          x = state.pos.x;
          y = state.pos.y;
        }
        upsertExtract(x, y, { code: 'MANUAL_EXIT', name: 'Exit' }, 'CM MANUAL EXTRACT');
        saveState();
        render();
        update();
        return { ok: true, x: x, y: y };
      };
      window.cmRebuildWalls = function() {
        rebuildBlockedEdgesFromTiles();
        saveState();
        update();
        console.log('CM rebuild walls:', {
          ok: true,
          blockedEdges: Object.keys(state.blockedEdges || {}).length,
          wallTiles: Object.keys(state.tiles || {}).filter(function(k) { return isWallTile(state.tiles[k]); }).length
        });
        return {
          ok: true,
          blockedEdges: Object.keys(state.blockedEdges || {}).length,
          wallTiles: Object.keys(state.tiles || {}).filter(function(k) { return isWallTile(state.tiles[k]); }).length
        };
      };
      window.cmDirectionBits = function() {
        var result = {
          learned: Object.assign({}, learnedDirBits),
          candidates: JSON.parse(JSON.stringify(directionBitCandidates))
        };
        console.log('CM direction bits:', result);
        return result;
      };
      window.cmDedupHazards = function() {
        var changed = 0;
        var hazards = Object.keys(state.hazards || {}).map(function(key) {
          return state.hazards[key];
        });
        for (var i = 0; i < hazards.length; i++) {
          var h = hazards[i];
          if (!h) continue;
          if (upsertHazard(h.x, h.y, h.item || { name: 'hazard' }, 'CM HAZARD DEDUP')) changed++;
        }
        saveState();
        render();
        update();
        console.log('CM hazard dedup:', { changed: changed, hazards: Object.keys(state.hazards || {}).length });
        return { ok: true, changed: changed, hazards: Object.keys(state.hazards || {}).length };
      };
      window.cmDebugDiamond = function(radius) {
        radius = typeof radius === 'number' ? radius : 3;
        var centers = [];
        if (state.pos) centers.push({ label: 'pos', x: state.pos.x, y: state.pos.y });
        for (var shinyKey in state.shinies || {}) {
          var shiny = state.shinies[shinyKey];
          if (shiny) centers.push({ label: 'shiny', x: shiny.x, y: shiny.y, key: shinyKey, item: shiny.item || null });
        }

        var wanted = {};
        centers.forEach(function(center) {
          for (var y = center.y - radius; y <= center.y + radius; y++) {
            for (var x = center.x - radius; x <= center.x + radius; x++) {
              wanted[tileKey(x, y)] = true;
            }
          }
        });
        for (var digKey in state.diggables || {}) {
          var dig = state.diggables[digKey];
          if (!dig) continue;
          centers.push({ label: 'diggable', x: dig.x, y: dig.y, key: digKey });
          for (var dy = dig.y - radius; dy <= dig.y + radius; dy++) {
            for (var dx = dig.x - radius; dx <= dig.x + radius; dx++) {
              wanted[tileKey(dx, dy)] = true;
            }
          }
        }

        var tiles = {};
        var edgeRows = [];
        for (var key in wanted) {
          var tile = state.tiles && state.tiles[key];
          if (tile) tiles[key] = JSON.parse(JSON.stringify(tile));
          var parts = key.split(',');
          var tx = parseInt(parts[0], 10);
          var ty = parseInt(parts[1], 10);
          for (var side in OFFSETS) {
            var eKey = edgeKey(tx, ty, side);
            if ((state.blockedEdges && state.blockedEdges[eKey]) || (state.openEdges && state.openEdges[eKey])) {
              edgeRows.push({
                key: eKey,
                x: tx,
                y: ty,
                side: side,
                blocked: state.blockedEdges && state.blockedEdges[eKey] || null,
                open: !!(state.openEdges && state.openEdges[eKey])
              });
            }
          }
        }

        var visible = (window.cmLastGameData && window.cmLastGameData.visible || []).map(function(t) {
          return {
            x: t.x,
            y: t.y,
            type: classifyTile(t),
            directions: t.directions,
            diggable: !!t.diggable,
            object: t.object,
            item: t.item || t.treasure || t.shiny || null,
            keys: Object.keys(t || {}).join(','),
            raw: t
          };
        });

        var dump = {
          ok: true,
          createdAt: new Date().toISOString(),
          pos: state.pos || null,
          centers: centers,
          radius: radius,
          learnedDirBits: Object.assign({}, learnedDirBits),
          visible: visible,
          tiles: tiles,
          edges: edgeRows,
          directionConflicts: findDirectionConflicts(wanted),
          shinies: JSON.parse(JSON.stringify(state.shinies || {})),
          openEdgesCount: Object.keys(state.openEdges || {}).length,
          blockedEdgesCount: Object.keys(state.blockedEdges || {}).length
        };

        var stamp = new Date().toISOString().replace(/[:.]/g, '-');
        var jsonBlob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
        var jsonUrl = URL.createObjectURL(jsonBlob);
        var jsonLink = document.createElement('a');
        jsonLink.href = jsonUrl;
        jsonLink.download = 'cm-diamond-debug-' + stamp + '.json';
        document.body.appendChild(jsonLink);
        jsonLink.click();
        document.body.removeChild(jsonLink);
        URL.revokeObjectURL(jsonUrl);

        try {
          var imageLink = document.createElement('a');
          imageLink.href = canvas.toDataURL('image/png');
          imageLink.download = 'cm-diamond-debug-' + stamp + '.png';
          document.body.appendChild(imageLink);
          imageLink.click();
          document.body.removeChild(imageLink);
        } catch (e) {
          dump.pngError = e.message || String(e);
        }

        console.log('CM diamond debug:', dump);
        return dump;
      };
      window.cmVisionDebug = function() {
        var frame = getVisionFrame();
        if (!frame) {
          console.log('CM vision debug: no frame');
          return null;
        }
        var playerCenter = findPlayerCenter(frame);
        var result = {
          frame: { width: frame.width, height: frame.height, mode: frame.mode, blank: frameLooksBlank(frame) },
          playerCenter: playerCenter,
          config: JSON.parse(JSON.stringify(visionConfig))
        };
        console.log('CM vision debug:', result);
        return result;
      };
      window.cmSetVisionConfig = function(opts) {
        opts = opts || {};
        if (typeof opts.tileSize === 'number') visionConfig.tileSize = opts.tileSize;
        if (typeof opts.offsetX === 'number') visionConfig.offsetX = opts.offsetX;
        if (typeof opts.offsetY === 'number') visionConfig.offsetY = opts.offsetY;
        if (typeof opts.autoCenter === 'boolean') visionConfig.autoCenter = opts.autoCenter;
        if (typeof opts.playerCenterYOffset === 'number') visionConfig.playerCenterYOffset = opts.playerCenterYOffset;
        if (typeof opts.scanRadius === 'number') visionConfig.scanRadius = opts.scanRadius;
        if (typeof opts.sampleStep === 'number') visionConfig.sampleStep = opts.sampleStep;
        if (typeof opts.enabled === 'boolean') visionConfig.enabled = opts.enabled;
        if (typeof opts.scanTiles === 'boolean') visionConfig.scanTiles = opts.scanTiles;
        if (typeof opts.scanEdges === 'boolean') visionConfig.scanEdges = false;
        console.log('CM vision config:', JSON.stringify(visionConfig));
        return scanVisionMap(true);
      };

      // Check for new run BEFORE processing (pass full data for sessionId access)
      var newRunSignals = detectNewRun(data);
      if (newRunSignals) {
        var confirmed = await handleNewRunDetected(newRunSignals, data);
        if (!confirmed) {
          // User declined reset, continue with current map data
          console.log('CM: Continuing with current map');
        }
        // Continue processing (either with fresh state or existing)
      }

      var oldPosObj = state.pos ? { x: state.pos.x, y: state.pos.y } : null;
      var oldPos = oldPosObj ? tileKey(oldPosObj.x, oldPosObj.y) : null;

      if (g.position !== undefined) {
        var newPos = { x: g.position % 100, y: Math.floor(g.position / 100) };
        var newKey = tileKey(newPos.x, newPos.y);
        var movedIntoDiggableTile = !!(state.tiles[newKey] && state.tiles[newKey].type === 'diggable_wall');
        state.walked[newKey] = true;
        trackPendingData(newKey, 'walked', true);
        if (state.tiles[newKey] && state.tiles[newKey].type === 'diggable_wall') {
          markBrokenDiggable(newPos.x, newPos.y);
        }
        if (state.tiles[newKey] && state.tiles[newKey].type === 'wall') {
          state.tiles[newKey].type = 'floor';
          state.tiles[newKey].walls = { n: false, e: false, s: false, w: false };
          state.tiles[newKey].wallKinds = {};
        }
        if (state.tiles[newKey]) {
          reconcileOpenEdgesForTile(state.tiles[newKey]);
        }

        if (oldPosObj && (oldPosObj.x !== newPos.x || oldPosObj.y !== newPos.y)) {
          var side = movementSide(oldPosObj, newPos);
          if (side) {
            rememberWalkedEdge(oldPosObj, newPos);
            markOpenEdge(oldPosObj, newPos);
            if (g.wallBroken === true || movedIntoDiggableTile) {
              var brokenEdge = rememberDiggableEdge(oldPosObj, newPos);
              console.log('CM DIGGABLE EDGE REMEMBERED:', brokenEdge);
            }
            var oldVisibleTile = getTileFromVisible(g.visible, oldPosObj.x, oldPosObj.y) || state.tiles[oldPos];
            var newVisibleTile = getTileFromVisible(g.visible, newPos.x, newPos.y) || state.tiles[newKey];
            learnDirectionBit(side, oldVisibleTile && oldVisibleTile.directions);
            learnDirectionBit(OFFSETS[side].opposite, newVisibleTile && newVisibleTile.directions);
          }
        }

        state.pos = newPos;
        
        // Set initial session tracking if not set
        if (!crowdsource.spawnPosition || !crowdsource.gameSessionId) {
          crowdsource.spawnPosition = crowdsource.spawnPosition || newKey;
          crowdsource.gameDay = crowdsource.gameDay || getUTCGameDay();
          // Store sessionId from the data
          if (g.sessionId && !crowdsource.gameSessionId) {
            crowdsource.gameSessionId = g.sessionId;
            console.log('CM: Initial sessionId stored:', g.sessionId);
          }
          saveCrowdsourceState();
        }
        
        if (oldPos !== null && oldPos !== newKey) {
          state.totalSteps++;
        }
      }

      if (g.energy !== undefined) {
        state.energy = g.energy;
        state.maxEnergy = g.maxEnergy || state.maxEnergy || ROUTE_START_ENERGY;
        crowdsource.lastEnergy = g.energy;
      }

      // Detect extract points - only when canExtract is explicitly true
      if (g.canExtract === true && state.pos) {
        upsertExtract(state.pos.x, state.pos.y, null, 'CM EXTRACT');
      }

      if (g.visible && g.visible.length) {
        var rememberedBrokenEdges = rememberBrokenVisibleEdges(g.visible);
        if (rememberedBrokenEdges) {
          console.log('CM DIGGABLE EDGES REMEMBERED FROM VISIBLE CHANGES:', rememberedBrokenEdges);
        }
        for (var i = 0; i < g.visible.length; i++) {
          addTile(g.visible[i]);
        }
        updateVisibleWallEdges(g.visible);
      }

      scanGameObjects(g, 'game', null, [], 0);
      scanVisionMap(false);

      if (g.itemFound && state.pos) {
        var item = g.itemFound;
        var key = tileKey(state.pos.x, state.pos.y);
        if (isHazard(item)) {
          upsertHazard(state.pos.x, state.pos.y, item, 'CM HAZARD');
        } else if (isExtractItem(item)) {
          upsertExtract(state.pos.x, state.pos.y, item, 'CM EXTRACT ITEM');
        } else if (isShiny(item)) {
          var shinyTile = ensureFloorTile(state.pos.x, state.pos.y, 'shiny');
          shinyTile.shiny = true;
          shinyTile.directionUnreliable = true;
          shinyTile.item = item;
          if (!state.shinies[key]) {
            state.shinies[key] = { x: state.pos.x, y: state.pos.y, item: item };
            trackPendingData(key, 'shiny', { x: state.pos.x, y: state.pos.y });
            console.log('CM SHINY:', item.code, 'at', key);
          }
          rebuildShinyPairWalls();
        } else {
          console.log('CM itemFound ignored:', item);
        }
      }

      center();
      update();
      saveState();
      
      // Check if we should auto-submit
      if (shouldAutoSubmit()) {
        submitContribution();
      }
    } catch (e) {
      console.log('CM error:', e);
    }
  }

  // ==================== API INTERCEPTION ====================
  var origXHROpen = XMLHttpRequest.prototype.open;
  var origXHRSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url) {
    this._cmUrl = url;
    return origXHROpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function() {
    var xhr = this;
    var url = this._cmUrl || '';
    if (url.indexOf('cave-game-server') >= 0) {
      xhr.addEventListener('load', function() {
        try {
          var data = JSON.parse(xhr.responseText);
          process(data);
        } catch (e) {}
      });
    }
    return origXHRSend.apply(this, arguments);
  };

  var origFetch = window.fetch;
  window.fetch = function() {
    var args = arguments;
    return origFetch.apply(this, args).then(function(res) {
      try {
        var url = args[0] ? args[0].toString() : '';
        if (url.indexOf('cave-game-server') >= 0) {
          res.clone().json().then(process).catch(function() {});
        }
      } catch (e) {}
      return res;
    });
  };

  // ==================== EVENT HANDLERS ====================
  var header = document.getElementById('cm-header');
  var dragging = false, dx, dy;
  header.onmousedown = function(e) {
    dragging = true;
    dx = e.clientX - panel.offsetLeft;
    dy = e.clientY - panel.offsetTop;
  };
  document.onmousemove = function(e) {
    if (dragging) {
      panel.style.left = (e.clientX - dx) + 'px';
      panel.style.top = (e.clientY - dy) + 'px';
      panel.style.right = 'auto';
    }
  };
  document.onmouseup = function() {
    dragging = false;
    if (activeStroke) {
      activeStroke = null;
      saveState();
    }
    if (mapTool === 'eraser') saveState();
    pan = null;
  };

  canvas.onwheel = function(e) {
    e.preventDefault();
    var old = view.scale;
    view.scale = e.deltaY < 0 ? Math.min(40, view.scale * 1.2) : Math.max(4, view.scale / 1.2);
    var r = view.scale / old;
    var rect = canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left, my = e.clientY - rect.top;
    view.offX = mx - (mx - view.offX) * r;
    view.offY = my - (my - view.offY) * r;
    render();
  };

  var pan = null;
  canvas.onmousedown = function(e) {
    if (mapTool === 'marker') {
      activeStroke = { color: '#ff2222', points: [screenToMapPoint(e)] };
      state.markerStrokes = state.markerStrokes || [];
      state.markerStrokes.push(activeStroke);
      render();
      return;
    }
    if (mapTool === 'eraser') {
      if (eraseMarkerAt(screenToMapPoint(e))) {
        saveState();
        render();
      }
      return;
    }
    pan = { x: e.clientX, y: e.clientY, ox: view.offX, oy: view.offY };
  };
  canvas.onmousemove = function(e) {
    if (activeStroke) {
      var point = screenToMapPoint(e);
      var last = activeStroke.points[activeStroke.points.length - 1];
      var dxp = point.x - last.x;
      var dyp = point.y - last.y;
      if (Math.sqrt(dxp * dxp + dyp * dyp) > 0.12) {
        activeStroke.points.push(point);
        render();
      }
      return;
    }
    if (mapTool === 'eraser' && e.buttons) {
      if (eraseMarkerAt(screenToMapPoint(e))) render();
      return;
    }
    if (pan) {
      view.offX = pan.ox + (e.clientX - pan.x);
      view.offY = pan.oy + (e.clientY - pan.y);
      render();
    }
  };
  canvas.onmouseup = function() {
    if (activeStroke) {
      activeStroke = null;
      saveState();
    }
    if (mapTool === 'eraser') saveState();
    pan = null;
  };
  canvas.onmouseleave = function() {
    if (activeStroke) {
      activeStroke = null;
      saveState();
    }
    if (mapTool === 'eraser') saveState();
    pan = null;
  };

  // Button handlers
  document.getElementById('cm-center').onclick = center;
  document.getElementById('cm-fit').onclick = fit;
  document.getElementById('cm-tool-pan').onclick = function() { setMapTool('pan'); };
  document.getElementById('cm-tool-marker').onclick = function() { setMapTool('marker'); };
  document.getElementById('cm-tool-eraser').onclick = function() { setMapTool('eraser'); };
  document.getElementById('cm-clear-ink').onclick = function() {
    state.markerStrokes = [];
    saveState();
    render();
  };
  setMapTool('pan');
  document.getElementById('cm-route').onclick = function() {
    var btn = document.getElementById('cm-route');
    btn.textContent = '...';
    setRouteStatus('Showing resource zones...');
    setTimeout(function() {
      try {
        var zones = computeRewardZones();
        state.routePlan = { path: [], targets: [], zones: zones, zonesOnly: true };
        setRouteStatus('v ' + CM_SCRIPT_VERSION + ': ' + zones.length + ' resource zones');
        render();
      } catch (e) {
        state.routePlan = { path: [], targets: [], zones: [], zonesOnly: true };
        setRouteStatus('Zones failed: ' + (e && e.message ? e.message : e));
        console.log('CM zones error:', e);
      } finally {
        btn.textContent = 'Route';
      }
    }, 20);
  };
  
  document.getElementById('cm-import').onclick = function() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = function(e) {
      var file = e.target.files[0];
      if (!file) return;
      
      var reader = new FileReader();
      reader.onload = function(e) {
        try {
          var data = JSON.parse(e.target.result);
          var choice = confirm('Import map data?\n\nOK = Replace current map\nCancel = Merge with current map');
          
          if (choice) {
            state.tiles = {};
            state.shinies = {};
            state.hazards = {};
            state.extracts = {};
            state.diggables = {};
            state.diggableEdges = {};
            state.savedMarkerPairEdges = {};
            state.markerPairEdges = {};
            state.walked = {};
            state.walkedEdges = {};
            state.brokenDiggables = {};
            state.openEdges = {};
            state.blockedEdges = {};
            state.routePlan = null;
            state.markerStrokes = [];
            state.totalSteps = 0;
          }
          
          if (data.shinies && Array.isArray(data.shinies)) {
            data.shinies.forEach(function(s) {
              var key = s.x + ',' + s.y;
              state.shinies[key] = { x: s.x, y: s.y };
            });
          }
          
          if (data.fences && Array.isArray(data.fences)) {
            data.fences.forEach(function(f) {
              var key = f.x + ',' + f.y;
              state.hazards[key] = { x: f.x, y: f.y };
            });
          }
          
          if (data.extracts && Array.isArray(data.extracts)) {
            data.extracts.forEach(function(ex) {
              var key = ex.x + ',' + ex.y;
              state.extracts[key] = { x: ex.x, y: ex.y };
            });
          }

          if (data.diggables && typeof data.diggables === 'object') {
            Object.assign(state.diggables, data.diggables);
          }

          if (data.diggableEdges && typeof data.diggableEdges === 'object') {
            Object.assign(state.diggableEdges, data.diggableEdges);
          }

          if (data.savedMarkerPairEdges && typeof data.savedMarkerPairEdges === 'object') {
            Object.assign(state.savedMarkerPairEdges, data.savedMarkerPairEdges);
          } else if (data.markerPairEdges && typeof data.markerPairEdges === 'object') {
            Object.assign(state.savedMarkerPairEdges, data.markerPairEdges);
          }
          state.markerPairEdges = Object.assign({}, state.savedMarkerPairEdges);
          
          if (data.tiles && typeof data.tiles === 'object') {
            for (var tileKey in data.tiles) {
              if (choice) {
                state.tiles[tileKey] = data.tiles[tileKey];
              } else {
                if (state.tiles[tileKey]) {
                  state.tiles[tileKey].seen = (state.tiles[tileKey].seen || 1) + (data.tiles[tileKey].seen || 1);
                } else {
                  state.tiles[tileKey] = data.tiles[tileKey];
                }
              }
            }
          }
          
          if (data.walked && typeof data.walked === 'object') {
            for (var walkKey in data.walked) {
              state.walked[walkKey] = true;
            }
          }

          if (data.walkedEdges && typeof data.walkedEdges === 'object') {
            Object.assign(state.walkedEdges, data.walkedEdges);
          }

          if (data.openEdges && typeof data.openEdges === 'object') {
            Object.assign(state.openEdges, data.openEdges);
          }

          if (data.blockedEdges && typeof data.blockedEdges === 'object') {
            Object.assign(state.blockedEdges, data.blockedEdges);
          }

          if (data.markerStrokes && Array.isArray(data.markerStrokes)) {
            if (choice) {
              state.markerStrokes = data.markerStrokes;
            } else {
              state.markerStrokes = (state.markerStrokes || []).concat(data.markerStrokes);
            }
          }

          if (data.totalSteps) {
            if (choice) {
              state.totalSteps = data.totalSteps;
            } else {
              state.totalSteps = Math.max(state.totalSteps, data.totalSteps);
            }
          }
          
          saveState();
          center();
          update();
          
          var tilesCount = Object.keys(state.tiles).length;
          var mapVisible = ((tilesCount / TOTAL_TILES) * 100).toFixed(2);
          alert('Import complete!\n' + Object.keys(state.shinies).length + ' shinies\n' + Object.keys(state.hazards).length + ' fences\n' + Object.keys(state.extracts).length + ' extracts\n' + tilesCount + ' tiles (' + mapVisible + '% visible)');
          
        } catch (err) {
          alert('Import failed: ' + err.message);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };
  
  document.getElementById('cm-clear').onclick = function() {
    if (confirm('Clear all map data? This will also start a new run session.\n\nThis cannot be undone.')) {
      state.tiles = {};
      state.shinies = {};
      state.hazards = {};
      state.extracts = {};
      state.diggables = {};
      state.diggableEdges = {};
      state.savedMarkerPairEdges = {};
      state.markerPairEdges = {};
      state.walked = {};
      state.brokenDiggables = {};
      state.openEdges = {};
      state.blockedEdges = {};
      state.routePlan = null;
      state.markerStrokes = [];
      state.totalSteps = 0;
      
      // Reset crowdsource state for new run
      crowdsource.runSessionId = null;
      crowdsource.spawnPosition = null;
      crowdsource.gameDay = getUTCGameDay();
      crowdsource.pendingTiles = {};
      crowdsource.pendingShinies = {};
      crowdsource.pendingFences = {};
      crowdsource.pendingExtracts = {};
      crowdsource.pendingWalked = {};
      crowdsource.lastSubmittedState = { tilesCount: 0, shiniesCount: 0, fencesCount: 0, extractsCount: 0 };
      
      if (state.pos) {
        var key = state.pos.x + ',' + state.pos.y;
        state.walked[key] = true;
        crowdsource.spawnPosition = key;
      }
      
      view.scale = 10;
      center();
      update();
      saveState();
      saveCrowdsourceState();
      console.log('CM: Map cleared, new run started for', crowdsource.gameDay);
    }
  };
  
  document.getElementById('cm-add-extract').onclick = function() {
    if (state.pos) {
      var key = state.pos.x + ',' + state.pos.y;
      if (!state.extracts[key]) {
        state.extracts[key] = { x: state.pos.x, y: state.pos.y };
        trackPendingData(key, 'extract', state.extracts[key]);
      }
      console.log('CM EXTRACT added at', state.pos.x, state.pos.y);
      render();
      update();
      saveState();
    } else {
      alert('No position detected yet. Walk around first!');
    }
  };
  
  document.getElementById('cm-cloud-save').onclick = function() {
    var dayLabel = crowdsource.gameDay || getUTCGameDay();
    var name = prompt('Save name (optional):', 'Run ' + dayLabel);
    if (name !== null) {
      cloudSave(name);
    }
  };
  
  document.getElementById('cm-cloud-load').onclick = loadCloudSaves;

  document.getElementById('cm-export').onclick = function() {
    var shinies = [], hazards = [], extracts = [];
    for (var k in state.shinies) {
      shinies.push({ x: state.shinies[k].x, y: state.shinies[k].y });
    }
    for (var k in state.hazards) {
      hazards.push({ x: state.hazards[k].x, y: state.hazards[k].y });
    }
    for (var k in state.extracts) {
      extracts.push({ x: state.extracts[k].x, y: state.extracts[k].y });
    }
    
    var tilesExplored = Object.keys(state.tiles).length;
    var mapVisible = ((tilesExplored / TOTAL_TILES) * 100).toFixed(2);
    
    // Filter tiles to only include floors for export
    var exportTiles = {};
    for (var k in state.tiles) {
      if (state.tiles[k].type !== 'wall') {
        exportTiles[k] = state.tiles[k];
      }
    }
    
    var exportData = {
      shinies: shinies,
      fences: hazards,
      extracts: extracts,
      diggables: state.diggables,
      diggableEdges: state.diggableEdges,
      savedMarkerPairEdges: state.savedMarkerPairEdges,
      tiles: exportTiles,
      walked: state.walked,
      walkedEdges: state.walkedEdges,
      brokenDiggables: state.brokenDiggables,
      openEdges: state.openEdges,
      blockedEdges: state.blockedEdges,
      markerStrokes: state.markerStrokes,
      totalSteps: state.totalSteps,
      stats: {
        tilesExplored: tilesExplored,
        mapVisible: parseFloat(mapVisible),
        shiniesCount: shinies.length,
        fencesCount: hazards.length,
        extractsCount: extracts.length,
        totalSteps: state.totalSteps
      },
      meta: {
        version: '3.0',
        exportedAt: new Date().toISOString(),
        gridSize: GRID_SIZE,
        gameDay: crowdsource.gameDay
      }
    };
    
    var json = JSON.stringify(exportData, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'cave-map-' + (crowdsource.gameDay || new Date().toISOString().slice(0, 10)) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log('Exported:', shinies.length, 'shinies,', hazards.length, 'fences,', extracts.length, 'extracts,', tilesExplored, 'tiles');
  };

  document.getElementById('cm-close').onclick = function() {
    // Submit any pending data before closing
    if (currentUser && crowdsource.enabled) {
      var pending = getPendingCounts();
      if (pending.tiles + pending.shinies + pending.fences + pending.extracts > 0) {
        submitContribution();
      }
    }
    panel.remove();
    window.caveMapperLoaded = false;
  };

  // Initial setup
  setTimeout(function() {
    resizeCanvas();
    center();
    update();
  }, 100);

  setInterval(function() {
    scanVisionMap(false);
  }, 600);
  
  console.log('🐺 Cave Mapper v3.0 ready! (with crowdsourced aggregation)');
})();
