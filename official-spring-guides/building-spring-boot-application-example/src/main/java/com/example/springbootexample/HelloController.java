package com.example.springbootexample;

import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HelloController {

  @RequestMapping("/")
  public String greeting(){
    return "Hello, Spring Boot!";
  }

}
