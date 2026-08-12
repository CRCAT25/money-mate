let io;

export function setIo(instance) {
  io = instance;
}

export function emitFamily(familyId, event, payload = {}) {
  io?.to(`space:${familyId}`).emit(event, { ...payload, spaceId: familyId });
}
