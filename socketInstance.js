let ioRef = null;
module.exports = {
  setIO(io){ ioRef = io; },
  getIO(){ return ioRef; }
};