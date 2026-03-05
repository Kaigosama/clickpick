const { Server } = require('socket.io');

let io = null;

const setSocketServer = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE']
    }
  });

  io.on('connection', (socket) => {
    socket.on('join_stall', (stallId) => {
      if (!stallId) return;
      socket.join(`stall:${stallId}`);
    });

    socket.on('leave_stall', (stallId) => {
      if (!stallId) return;
      socket.leave(`stall:${stallId}`);
    });
  });

  return io;
};

const emitMenuUpdated = ({ stallId, action, item }) => {
  if (!io || !stallId) return;

  io.to(`stall:${String(stallId)}`).emit('menu:updated', {
    stallId: String(stallId),
    action,
    item,
    updatedAt: new Date().toISOString()
  });
};

const emitStoreStatusUpdated = ({ stallId, storeOpen }) => {
  if (!io || !stallId) return;

  io.emit('store:status_updated', {
    stallId: String(stallId),
    storeOpen: storeOpen !== false,
    updatedAt: new Date().toISOString()
  });
};

module.exports = {
  setSocketServer,
  emitMenuUpdated,
  emitStoreStatusUpdated
};
