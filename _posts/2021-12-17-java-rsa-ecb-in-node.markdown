---
layout: post
title:  "RSA/ECB/PKCS1Padding in Node.js"
date:   2021-12-17
categories: encryption rsa ecb pkcs node java
---

In Java, you can encrypt a string using the cryptic `RSA/ECB/PKCS1Padding` algorithm.
If you try to do the same thing in Node.js, you'll soon realize that this is not possible.
Not because the equivalent does not exist in Node.js, but because the "algorithm" `RSA/ECB/PKCS1Padding` does not really exist and the identifier in Java is misleading.


## What is the problem?

Let's take a look at the following code in Java:

```java
public byte[] encrypt(String message, PublicKey publicKey) throws Exception {
    Cipher cipher = Cipher.getInstance("RSA/ECB/PKCS1Padding");
    cipher.init(Cipher.ENCRYPT_MODE, publicKey);
    return cipher.doFinal(message.getBytes());
}
```

This method takes a plaintext message and encrypts it using the specified public key.
Looking at the invocation `getInstance` on `Cipher` we get the idea that the algorithm used is `RSA/ECB/PKCS1Padding`.
But what is this?

"RSA" sounds like it is using [asymmetric encryption](https://en.wikipedia.org/wiki/Public-key_cryptography), but "ECB" is a [block cipher mode of operation](https://en.wikipedia.org/wiki/Block_cipher_mode_of_operation#ECB) typically used to encrypt multiple blocks of data using a symmetric key.

So what does this cipher actually do? Does it create a random key for the symmetric encryption and then encrypt that key with the public key appending it to the message as is done in [hybrid encryption](https://en.wikipedia.org/wiki/Hybrid_cryptosystem)?

Well, no. The name is just misleading. In fact, looking at the source code of the class Cipher, we see that the actual implementation for the encryption is in a class called [RSACipher.java](https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/com/sun/crypto/provider/RSACipher.java).
And inside that class, the following method reveals it all:

```java
// modes do not make sense for RSA, but allow ECB
// see JCE spec
protected void engineSetMode(String mode) throws NoSuchAlgorithmException {
    if (mode.equalsIgnoreCase("ECB") == false) {
        throw new NoSuchAlgorithmException("Unsupported mode " + mode);
    }
}
```

So `ECB` is used as an identifier, but has no actual meaning or influence. Passing anything else makes this method fail.

### What does really happen?

We haven't talked about padding yet.
I won't go into too much detail, but what you need to know is that encryption works on fixed-size blocks of data.
For example, if you have a message of 30 bytes and the algorithm encrypts 45 bytes at a time, then you need to add 15 bytes to the message.
When decrypting, that algorithm also needs to know that these 15 bytes were only added as padding and are not part of the original message.

What if the message is bigger that the amount of bytes that are encrypted at a time?
Usually, you'd encrypt the message block-by-block combing the individual blocks together.
This is where ECB would come into play.
As we saw before, ECB is ignored though.
Therefore, this method would throw an exception when called with a message that is bigger than one block.

Knowing that ECB is ignored, what this algorithm really does is encrypt the message with the public key using PKCS1 padding.

## How can the equivalent be done with Node.js?

Let's say we want to do the same in Node.js.
We wouldn't be the first one to search online for "how to do RSA/ECB/PKCS1Padding in Node.js".
This has been asked in [a popular node library's issue tracker](https://github.com/digitalbazaar/forge/issues/407) but also on [StackOverflow for python](https://stackoverflow.com/questions/2855326/how-can-i-create-a-key-using-rsa-ecb-pkcs1padding-in-python/2856628)

All answers point to the same: It does not make sense and therefore does not exist.
However, knowing what we learned above, what we actually need is a way to encrypt a message with RSA using PKCS1 padding.
This makes the search easier.

In Node.js, we can use the module [node-forge](https://www.npmjs.com/package/node-forge).
You can install it using the following command:

```bash
> node install node-forge
```

And then we can use it to encrypt the message:

```javascript
function encrypt(message, publicKey) {
    var bytes = forge.util.createBuffer(message, 'utf8').getBytes();
    return publicKey.encrypt(bytes, 'RSAES-PKCS1-V1_5');
}
```

This is assuming that the specified `publicKey` has been created with forge as well.
There are several examples in their [documentation](https://github.com/digitalbazaar/forge#rsa) how a public key can be created.

## Conclusion

The naming for this algorithm is really misleading.
This makes the search for the equivalent implementation much more difficult than it should be.
Instead of finding what we're looking for, we had to take a look at the source code to see what really happens.

Once it's clear what's really happening, the solution turns out to be quite simple though.
