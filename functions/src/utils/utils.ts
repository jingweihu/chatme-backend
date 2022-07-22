
export class threadutils {
  static createMemberGroup(uid: string, friendUid: string): { [key: string]: boolean} {
    const memberGroup: { [key: string]: boolean} = {};
    memberGroup[uid] = true;
    memberGroup[friendUid] = true;
    return memberGroup;
  }
}
