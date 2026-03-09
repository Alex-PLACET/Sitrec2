import {Globals} from "../src/Globals";
import {isAdmin} from "../src/configUtils";

describe("isAdmin", () => {
    const originalUserID = Globals.userID;
    const originalUserData = Globals.userData;

    afterEach(() => {
        Globals.userID = originalUserID;
        Globals.userData = originalUserData;
    });

    test("uses server-reported admin groups when available", () => {
        Globals.userID = 42;
        Globals.userData = {userID: 42, userGroups: [2, 3, 14]};

        expect(isAdmin()).toBe(true);
    });

    test("treats non-admin user groups as non-admin", () => {
        Globals.userID = 42;
        Globals.userData = {userID: 42, userGroups: [2, 14]};

        expect(isAdmin()).toBe(false);
    });

    test("falls back to the legacy user id heuristic when groups are unavailable", () => {
        Globals.userID = 1;
        Globals.userData = {userID: 1};

        expect(isAdmin()).toBe(true);
    });
});
