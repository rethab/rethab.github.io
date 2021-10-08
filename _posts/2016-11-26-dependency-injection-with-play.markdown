---
layout: post
title:  "Practical Dependency Injection for the Play Framework using Guice: Part 1"
date:   2016-11-26
categories: play scala guice dependency injection
---

This is the first part in a series of articles on dependency injection for the play framework using guice. As soon as I've written the next part, it will be linked here.

Please note that while the examples are written in Scala, the pricinples apply for Java likewise.

Furthermore, please be aware that Guice is not the only framework to do dependency injection with. It is probably the most prominent one in the play ecosystem though. Guice does so called *runtime dependency injection*. This means dependencies are resolved at runtime. An alternative approach is *compile time dependency injection*, which essentially means if a dependency cannot be resolved, the code doesn't even compile.  Please read the play documentation for more on the latter: [Compile Time Dependency Injection](https://www.playframework.com/documentation/2.5.x/ScalaCompileTimeDependencyInjection)

## Why Dependency Injection?
At the time of writing, version 2.5 is released and the play framework is in the process of moving away from global state ([What exactly is that global state?](http://stackoverflow.com/a/40799224/1080523)). While older version heavily relied on the function `Play.current`, this has now been deprecated and people are looking for ways to restructure their applications to no longer depend on this.

Accessing the currently running application used to be the central access point for a variety of components such as `Configuration`, `ActorSystem`, `Connection`, `WSClient` and many more. Therefore, we now need a new way to access them.

## A Simple Example
The following example shows how we could use the configuration in a controller where we previously might have used `Play.configuration`. Adding the annotation `javax.inject.Inject` directly after the class name allows us to specify a number of components that we would like an instance to be injected.

```java
class MyController @Inject() (config: Configuration) {
  val maxSize = config.getInt("maxSize")
}
```

### What just happened?
If we look at the above example again, we can see that our controller is a simple class that takes one parameter. But how does the framework know which exact parameter is to be passed in there? This is defined by using so called *bindings*. A binding can be roughly formulated by saying *if a thing of type A needs to be injected into a constructor, which concrete instance of A shall be taken*.

A number of bindings are provided by the play framework. For example, as seen above, the play framework defines (in a class called `BuiltinModule.scala`, for the impatient) which concrete instance of Configuration is to be injected if a user requests a Configuration. An (incomplete) list of the components that are provided by the play framework can be found in the [2.4 Migration Guide](https://www.playframework.com/documentation/2.4.x/Migration24#Dependency-Injected-Components).

### Migrating Companion Objects
A consequence of injecting instances is that code that requires such a component can no longer live in a companion object as it could before. Let's say we have a service that has to access the configuration and a controller that uses the service:
```java
object MyService {
  def getMaxSize: Option[Int] = Play.configuration.getInt("maxSize")
}

class MyController {
  val maxSize = MyService.getMaxSize 
}
```
Now that we need to avoid static access to the configuration and inject it instead, we also need to migrate the service to a class. But then how does the controller access the service? Just like the service injects the configuration, the controller now needs to inject the service:
```java
class MyService @Inject() (config: Configuration) {
  def getMaxSize: Option[Int] = config.getInt("maxSize")
}

class MyController @Inject() (myService: MyService) {
  val maxSize = myService.getMaxSize
}
```

## Why go through all this Hassle?
As the above example with the service and the controller has shown, using dependency injection increased the size of the code and made it a bit more complicated as when compared with directly invoking the method on the companion object.

One big win of dependency injection, however, is testability. Just imagine for a second how you'd write a test for the method `getMaxSize` in the companion object. Since it accesses the configuration from the currently running application, you'd need to make sure that an application is running when you're testing that method. Think about this: You need an entire play application running just to test a simple method!

Injecting the dependencies greatly simplifies that. You can now instantiate the service directly in your test and pass in the configuration required for your test - scenario. You could even easily test the behavior if the key `maxSize` does not exist (the example uses [specs2](http://etorreborre.github.io/specs2/)).
```java
class MyServiceTest extends Specification {
  "getMaxSize" should {
    "return the size" >> {
       val config = Configuration("maxSize" -> 4)
       val service = new MyService(config)
       service.getMaxSize must_=== Some(4)
    }

    "return none if not configured" >> {
       val config = Configuration()
       val service = new MyService(config)
       service.getMaxSize must beNone
    }
  }
}
```

# Conclusion
In this first article, I have tried to shed some light into why the play framework uses dependency injection in the first place as well as a few examples on how to use dependency injection within an application and the benefits that come along with it.

Stay tuned for the following parts where we're going to look at more realistic examples, learn how to define bindings and much more!


### Links and Further Reading
* Google Guice 101, Bob Lee Jesse Wilson: [https://www.youtube.com/watch?v=FFXhXZnmEQM](https://www.youtube.com/watch?v=FFXhXZnmEQM)
* Guice Docs: [https://github.com/google/guice/wiki/Motivation](https://github.com/google/guice/wiki/Motivation)
* Assisted Inject: [https://github.com/google/guice/wiki/AssistedInject](https://github.com/google/guice/wiki/AssistedInject)
