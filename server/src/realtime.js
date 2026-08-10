let io;

export function setIo(instance) {
  io = instance;
}

export function emitFamily(familyId, event, payload = {}) {
  io?.to(`family:${familyId}`).emit(event, payload);
}

