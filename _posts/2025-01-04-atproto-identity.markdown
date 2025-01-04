---
layout: post
title:  "AT Protocol Identity: PLC"
date:   2025-01-04
categories: [atproto,bluesky,did,plc]
---

The AT Protocol is an open, decentralized network for building social applications.

The new-ish social network Bluesky is an application built on top of the AT Protocol.
In this blog post, we're going to explore the identities in the AT Protocol, starting from Bluesky user handles.

### DID Resolution

A handle in Bluesky points to a DID by DNS or HTTPS.

The DID of `@jay.bsky.team` can be resolved via DNS.
Example with `dig`:

```bash
> dig _atproto.jay.bsky.team TXT
[...]
_atproto.jay.bsky.team.	14400	IN	TXT	"did=did:plc:oky5czdrnfjpqslsw2a5iclo"
```

If you don't have `dig` installed, you can use an online tool like [nslookup.io](https://www.nslookup.io/domains/_atproto.jay.bsky.team/dns-records/txt/)

If there is no DNS TXT entry, the handle might point to a DID via a well-known HTTPS endpoint.
Let's take the example of `@jamesgunn.sky.social`:

```bash
> curl https://jamesgunn.bsky.social/.well-known/atproto-did
did:plc:lotavzt36yanhfy3j3gpysyj
```

If you don't have `curl` installed, you can also just open the link in your browser [https://jamesgunn.bsky.social/.well-known/atproto-did](https://jamesgunn.bsky.social/.well-known/atproto-did).

### PLC

Once you have a DID, take a look at the second part after the colon.
That is called the method.
The above two examples use `plc`, which stands for Public Ledger of Credentials.
These PLC DIDs can be looked up in the PLC directory at [plc.directory](https://plc.directory).

We can again use `curl` to get more information about a DID.
Let's take `@jay.bsky.team`'s DID as example.

```bash
> curl https://plc.directory/did:plc:oky5czdrnfjpqslsw2a5iclo/log | jq
[
  {
    "sig": "KuN3A61golVNSDU71wZKLP9lVuXk6YekJAz1lwDzrPsNTEWHBBW_8zSyV6pDxV4KiYXuAXlS1Ik47XkjQZ94mA",
    "prev": null,
    "type": "create",
    "handle": "jay.bsky.social",
    "service": "https://bsky.social",
    "signingKey": "did:key:zQ3shP5TBe1sQfSttXty15FAEHV1DZgcxRZNxvEWnPfLFwLxJ",
    "recoveryKey": "did:key:zQ3shhCGUqDKjStzuDxPkTxN6ujddP4RkEKJJouJGRRkaLGbg"
  },
  {
    "sig": "TY3ot8yFF-0LL8ceoRwSGaNQj0F1aj-IApYXRGT21G1fnznKHUHT1QE7c1aTrYd9PQLVvXUGag6CZ9EEeIKqgA",
    "prev": "bafyreidswhiwi4ljkl4es4vwqhkas3spmmktortqbp6lkrb5v7qqdfr3mm",
    "type": "plc_operation",
    "services": {
      "atproto_pds": {
        "type": "AtprotoPersonalDataServer",
        "endpoint": "https://bsky.social"
      }
    },
    "alsoKnownAs": [
      "at://jay.bsky.social"
    ],
    "rotationKeys": [
      "did:key:zQ3shhCGUqDKjStzuDxPkTxN6ujddP4RkEKJJouJGRRkaLGbg",
      "did:key:zQ3shpKnbdPx3g3CmPf5cRVTPe1HtSwVn5ish3wSnDPQCbLJK"
    ],
    "verificationMethods": {
      "atproto": "did:key:zQ3shXjHeiBuRCKmM36cuYnm7YEMzhGnCmCyW92sRJ9pribSF"
    }
  },
  {
    "sig": "WmQmobHA6abtu8xIkBSrDkkoMNjOxP1Tl_1zl1DbIZlA9kjOyxjX-J1rzwWVy3stdzMowpBeBnedkAug84n_RQ",
    "prev": "bafyreicgb25yf5fro22oyhtkbgerzr4nume4sx757r525skxdzpeoeseha",
    "type": "plc_operation",
    "services": {
      "atproto_pds": {
        "type": "AtprotoPersonalDataServer",
        "endpoint": "https://bsky.social"
      }
    },
    "alsoKnownAs": [
      "at://jay.bsky.team"
    ],
    "rotationKeys": [
      "did:key:zQ3shhCGUqDKjStzuDxPkTxN6ujddP4RkEKJJouJGRRkaLGbg",
      "did:key:zQ3shpKnbdPx3g3CmPf5cRVTPe1HtSwVn5ish3wSnDPQCbLJK"
    ],
    "verificationMethods": {
      "atproto": "did:key:zQ3shXjHeiBuRCKmM36cuYnm7YEMzhGnCmCyW92sRJ9pribSF"
    }
  },
  {
    "sig": "dhstt4uPua8OVs8TVzHTqtCnNMsBDN7kjxIBmTIYBDRkknrtprBJ_AISXFoBZyqfoxq2altp-vlRAPEKSh5zeg",
    "prev": "bafyreihmf7dapx27fexc7jwj4cdpbxcmhnnwo3x5vrpvbr6lclzj7gpsmi",
    "type": "plc_operation",
    "services": {
      "atproto_pds": {
        "type": "AtprotoPersonalDataServer",
        "endpoint": "https://morel.us-east.host.bsky.network"
      }
    },
    "alsoKnownAs": [
      "at://jay.bsky.team"
    ],
    "rotationKeys": [
      "did:key:zQ3shhCGUqDKjStzuDxPkTxN6ujddP4RkEKJJouJGRRkaLGbg",
      "did:key:zQ3shpKnbdPx3g3CmPf5cRVTPe1HtSwVn5ish3wSnDPQCbLJK"
    ],
    "verificationMethods": {
      "atproto": "did:key:zQ3shtJpFGgEG3tv3ERKvjo7VHbjDPVyvjYvW7gpie49rtNtc"
    }
  }
]
```

Again, feel free to click on it instead [https://plc.directory/did:plc:oky5czdrnfjpqslsw2a5iclo/log](https://plc.directory/did:plc:oky5czdrnfjpqslsw2a5iclo/log).

This returns a list of all operations that have been performed on this DID.
The first entry is the genesis operation -- the one that created the DID.
It is the only one where `prev` (previous entry) is `null`, because it is the first one.

Note that the first entry of this DID has a different format.
This is the legacy format.
DIDs that are created these days use the new format (subsequent records), but `@jay.bsky.team` has been around for a while (she's the CEO of Bluesky).

If you look through the logs you'll notice a couple of changes that were made to her identity over time:
- the handle was changed from `jay.bsky.social` to `jay.bsky.team` (note that the legacy format used `handle` whereas the new format uses `alsoKnownAs`)
  - the handle now includes `at://`
- the personal data server changed from `https://bsky.social` to `https://morel.us-east.host.bsky.network`

### Signatures

Each entry in the log includes a `sig` field, which contains the signature.
This is a cryptographic signature created from the other fields in a particular entry.
For the genesis operation, the `rotationKeys` (or `signingKey` for legacy) field contains the public key(s) of the key pair(s), with which the entry was signed.

Subsequent operations need to be signed with the key from the previous entry.
Furthermore, the `prev` field links back to the previous entry.

### Creating a DID

The identifier in the DID, which is the last part of the colon-separated is constructed from the genesis operation.
For `@jay.bsky.team`:
- the identifier is `oky5czdrnfjpqslsw2a5iclo`
- the genesis operation is this JSON document:

```json
{
  "sig": "KuN3A61golVNSDU71wZKLP9lVuXk6YekJAz1lwDzrPsNTEWHBBW_8zSyV6pDxV4KiYXuAXlS1Ik47XkjQZ94mA",
  "prev": null,
  "type": "create",
  "handle": "jay.bsky.social",
  "service": "https://bsky.social",
  "signingKey": "did:key:zQ3shP5TBe1sQfSttXty15FAEHV1DZgcxRZNxvEWnPfLFwLxJ",
  "recoveryKey": "did:key:zQ3shhCGUqDKjStzuDxPkTxN6ujddP4RkEKJJouJGRRkaLGbg"
}
```

Steps:
- Encode the genesis operation in DAG-CBOR (this is a concise binary format and looks a bit like JSON)
- Create a SHA256 hash of the encoded document
- Encode the hash with base 32 and make it lowercase
- Take the first 24 characters
- Prepend `did:plc:` and you'll have your 32 - character DID

### Verification

Based on what we've learned so far we can verify a handle from Bluesky.
Say we want to check `@jay.bsky.team`:
- resolve DID via DNS: `did:plc:oky5czdrnfjpqslsw2a5iclo`
- lookup DID in PLC directory
- the handle in the `alsoKnownAs` (or `handle` for legacy) field needs to be the same as `jay.bsky.team`
- verify all operations using the public keys and signatures
- reconstruct the DID from the genesis operation and ensure it is the same as the one we found in the DNS TXT record

Can we trust the PLC directory though?
Say a malicious actor has taken over control and modified all entries in the log.
The hacker even constructed the entries in the log in a way that all the signatures check out.
How would we know the PLC directory was compromised?
Remember that the DID can be reconstructed from the genesis operation.
If that was modified, we'd end up with a different DID than the one we found in the DNS TXT record.

## Links & Further Reading

- [Bluesky Application](https://bsky.app)
- [AT Protocol](https://atproto.com)
  - [AT Protocol Identity](https://atproto.com/guides/identity)
  - [AT Protocol DID](https://atproto.com/specs/did)
  - [AT Protocol Handle](https://atproto.com/specs/handle)
- [Decentralized Identifiers (DIDs) v1.0](https://www.w3.org/TR/did-core)
- [`did:plc` Method Specification](https://web.plc.directory/spec/v0.1/did-plc)
- [Specification: DAG-CBOR](https://ipld.io/specs/codecs/dag-cbor/spec/)

