
export class RelationLoadChain {
    private _currentDeepness = 0;
    private _maxDeepness;
    public incrementCurrentDeepness() {
      this._currentDeepness++;
    }
    public restartCurrentDeepness() {
      this._currentDeepness = 0;
    }
    public get currentDeepness() {
      return this._currentDeepness;
    }
    public get maxDeepness() {
      return this._maxDeepness;
    }
    public hasReachedMaxDeepness() {
      return this._currentDeepness === this.maxDeepness;
    }
    constructor(
      maxDeepness: number = 1,
    ) {
      this._maxDeepness = maxDeepness;
    }
  }